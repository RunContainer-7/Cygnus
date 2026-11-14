import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChatMessage, FileEntry, ProjectMeta } from "./types";

export const WORKSPACE_ROOT = process.env.CYGNUS_WORKSPACE_DIR
  ? path.resolve(process.env.CYGNUS_WORKSPACE_DIR)
  : path.join(process.cwd(), "workspaces");

const ID_PATTERN = /^[a-z0-9]{8,16}$/;
const RESERVED_TOP_LEVEL = new Set(["meta.json", "chat.json"]);
const SKIPPED_DIRS = new Set(["node_modules", ".git", ".next", ".svn"]);
const MAX_FILE_BYTES = 400_000;
const MAX_INLINE_CHARS = 120_000;

export function isValidProjectId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function projectDir(id: string): string {
  if (!isValidProjectId(id)) throw new Error("Invalid project id.");
  const dir = path.join(WORKSPACE_ROOT, id);
  if (!dir.startsWith(WORKSPACE_ROOT + path.sep)) throw new Error("Invalid project path.");
  return dir;
}

function resolveInside(root: string, relativePath: string): string {
  const cleaned = relativePath
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!cleaned) throw new Error("Empty file path.");
  if (cleaned.split("/").some((segment) => segment === "..")) {
    throw new Error("A file path may not leave the project.");
  }
  const absolute = path.resolve(root, cleaned);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error("A file path may not leave the project.");
  }
  return absolute;
}

function assertWritablePath(relativePath: string): string {
  const cleaned = relativePath
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .trim();
  if (!cleaned || cleaned.endsWith("/")) {
    throw new Error("A file path is required.");
  }
  const parts = cleaned.split("/");
  if (parts.some((part) => part === "" || part === "..")) {
    throw new Error("That file path is not valid.");
  }
  if (RESERVED_TOP_LEVEL.has(cleaned)) {
    throw new Error(`${cleaned} is managed by Cygnus.`);
  }
  if (parts[0].startsWith(".") || parts.some((part) => SKIPPED_DIRS.has(part))) {
    throw new Error("That path is reserved.");
  }
  return cleaned;
}

function cleanProjectName(name: unknown): string {
  const value = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  return value.slice(0, 70) || "Untitled project";
}

export async function createProject(name?: unknown): Promise<ProjectMeta> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const id = crypto.randomBytes(4).toString("hex");
    const dir = path.join(WORKSPACE_ROOT, id);
    try {
      await fs.mkdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    const meta: ProjectMeta = {
      id,
      name: cleanProjectName(name),
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    return meta;
  }
  throw new Error("Could not allocate a project id.");
}

export async function projectExists(id: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectDir(id), "meta.json"));
    return true;
  } catch {
    return false;
  }
}

export async function readMeta(id: string): Promise<ProjectMeta> {
  const dir = projectDir(id);
  const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
  const parsed = JSON.parse(raw) as Partial<ProjectMeta>;
  return {
    id,
    name: typeof parsed.name === "string" ? parsed.name : "Untitled project",
    createdAt:
      typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
  };
}

export async function listFiles(id: string): Promise<FileEntry[]> {
  const root = projectDir(id);
  const out: FileEntry[] = [];

  async function walk(directory: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        await walk(path.join(directory, entry.name), relative);
        continue;
      }
      if (!prefix && RESERVED_TOP_LEVEL.has(entry.name)) continue;
      const stat = await fs.stat(path.join(directory, entry.name));
      out.push({ path: relative, size: stat.size });
    }
  }

  try {
    await walk(root, "");
  } catch {
    return [];
  }

  return out.sort((a, b) => {
    if (a.path === "index.html") return -1;
    if (b.path === "index.html") return 1;
    return a.path.localeCompare(b.path);
  });
}

export async function readFileSafe(id: string, relativePath: string): Promise<string> {
  const root = projectDir(id);
  const absolute = resolveInside(root, relativePath);
  const buffer = await fs.readFile(absolute);
  const text = buffer.toString("utf8");
  if (text.length > MAX_INLINE_CHARS) {
    return `${text.slice(0, MAX_INLINE_CHARS)}\n\n… truncated at ${MAX_INLINE_CHARS} characters.`;
  }
  return text;
}

export async function writeFileSafe(
  id: string,
  relativePath: string,
  content: string,
): Promise<number> {
  const cleaned = assertWritablePath(relativePath);
  const root = projectDir(id);
  const absolute = resolveInside(root, cleaned);
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(`That file is ${bytes} bytes; the limit is ${MAX_FILE_BYTES}.`);
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
  return bytes;
}

export async function deleteFileSafe(id: string, relativePath: string): Promise<void> {
  const cleaned = assertWritablePath(relativePath);
  const root = projectDir(id);
  const absolute = resolveInside(root, cleaned);
  const stat = await fs.lstat(absolute);
  if (!stat.isFile()) throw new Error("Only files can be deleted.");
  await fs.unlink(absolute);
}

export async function readChat(id: string): Promise<ChatMessage[]> {
  try {
    const raw = await fs.readFile(path.join(projectDir(id), "chat.json"), "utf8");
    const parsed = JSON.parse(raw) as { messages?: ChatMessage[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

export async function appendChat(id: string, message: ChatMessage): Promise<void> {
  const messages = await readChat(id);
  messages.push(message);
  const dir = projectDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "chat.json"), JSON.stringify({ messages }, null, 2));
}

export async function listProjects(): Promise<
  Array<ProjectMeta & { fileCount: number }>
> {
  let entries: string[] = [];
  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    entries = (await fs.readdir(WORKSPACE_ROOT)).filter((name) => isValidProjectId(name));
  } catch {
    return [];
  }

  const projects = await Promise.all(
    entries.map(async (id) => {
      try {
        const meta = await readMeta(id);
        const files = await listFiles(id);
        return { ...meta, fileCount: files.length };
      } catch {
        return null;
      }
    }),
  );

  return projects
    .filter((item): item is ProjectMeta & { fileCount: number } => item !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
}
