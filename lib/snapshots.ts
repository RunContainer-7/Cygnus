import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listFiles, projectDir } from "./workspace";

export type Snapshot = {
  id: string;
  label: string;
  createdAt: string;
  files: number;
  bytes: number;
};

type SnapshotMeta = Snapshot & { projectId: string };

const ID_PATTERN = /^[a-z0-9-]{6,40}$/;

function dataDir(): string {
  const workspace = process.env.CYGNUS_WORKSPACE_DIR;
  if (workspace) return path.dirname(workspace);
  return path.join(os.homedir(), ".cygnus");
}

function snapshotRoot(): string {
  return path.join(dataDir(), "snapshots");
}

function projectSnapshots(projectId: string): string {
  return path.join(snapshotRoot(), projectId);
}

function snapshotDir(projectId: string, snapshotId: string): string {
  if (!ID_PATTERN.test(snapshotId)) throw new Error("Unknown snapshot.");
  const dir = path.join(projectSnapshots(projectId), snapshotId);
  if (!dir.startsWith(snapshotRoot() + path.sep)) throw new Error("Unknown snapshot.");
  return dir;
}

function cleanLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text.slice(0, 90) || "Checkpoint";
}

async function readMeta(dir: string): Promise<SnapshotMeta | null> {
  try {
    const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<SnapshotMeta>;
    if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "string") return null;
    return {
      id: parsed.id,
      label: typeof parsed.label === "string" ? parsed.label : "Checkpoint",
      createdAt: parsed.createdAt,
      files: typeof parsed.files === "number" ? parsed.files : 0,
      bytes: typeof parsed.bytes === "number" ? parsed.bytes : 0,
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : "",
    };
  } catch {
    return null;
  }
}

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(projectSnapshots(projectId));
  } catch {
    return [];
  }

  const rows = await Promise.all(
    entries.map(async (entry) => {
      if (!ID_PATTERN.test(entry)) return null;
      const meta = await readMeta(path.join(projectSnapshots(projectId), entry));
      if (!meta) return null;
      const { projectId: _projectId, ...snapshot } = meta;
      return snapshot;
    }),
  );

  return rows
    .filter((row): row is Snapshot => row !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createSnapshot(
  projectId: string,
  label?: unknown,
): Promise<Snapshot> {
  const files = await listFiles(projectId);
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  const dir = path.join(projectSnapshots(projectId), id);
  const filesDir = path.join(dir, "files");
  const root = projectDir(projectId);

  await fs.mkdir(filesDir, { recursive: true });

  let bytes = 0;
  for (const file of files) {
    const target = path.join(filesDir, file.path);
    if (!target.startsWith(filesDir + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(root, file.path), target).catch(() => undefined);
    bytes += file.size;
  }

  const meta: SnapshotMeta = {
    id,
    label: cleanLabel(label),
    createdAt: new Date().toISOString(),
    files: files.length,
    bytes,
    projectId,
  };
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  const all = await listSnapshots(projectId);
  for (const stale of all.slice(20)) {
    await deleteSnapshot(projectId, stale.id).catch(() => undefined);
  }

  const { projectId: _projectId, ...snapshot } = meta;
  return snapshot;
}

export async function restoreSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<{ files: number }> {
  const dir = snapshotDir(projectId, snapshotId);
  const meta = await readMeta(dir);
  if (!meta) throw new Error("Unknown snapshot.");
  const source = path.join(dir, "files");
  const root = projectDir(projectId);

  const current = await listFiles(projectId);
  for (const file of current) {
    await fs.unlink(path.join(root, file.path)).catch(() => undefined);
  }

  let restored = 0;
  async function copy(directory: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const from = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(path.join(root, relative), { recursive: true });
        await copy(from, relative);
        continue;
      }
      const to = path.join(root, relative);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      restored += 1;
    }
  }

  await copy(source, "");
  return { files: restored };
}

export async function deleteSnapshot(projectId: string, snapshotId: string): Promise<void> {
  const dir = snapshotDir(projectId, snapshotId);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function pruneSnapshots(projectId: string, keep = 20): Promise<void> {
  const all = await listSnapshots(projectId);
  for (const stale of all.slice(keep)) {
    await deleteSnapshot(projectId, stale.id).catch(() => undefined);
  }
}
