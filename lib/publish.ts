import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectMeta } from "./types";
import { listFiles, readFileBytes, readMeta, writeMeta } from "./workspace";

/**
 * Publishing goes into the user's own free Cloudflare account. Cygnus holds
 * their API token locally (never in a project) and talks to Cloudflare
 * directly, so there is no Cygnus server, no shared account, and no bill.
 */

const API = "https://api.cloudflare.com/client/v4";
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

type CloudflareState = {
  token?: string;
  accountId?: string;
  accountName?: string;
};

type PublishState = {
  cloudflare?: CloudflareState;
};

export type PublishConnection = {
  connected: boolean;
  accountId?: string;
  accountName?: string;
};

export type CloudflareAccount = {
  id: string;
  name: string;
};

function dataDir(): string {
  const workspace = process.env.CYGNUS_WORKSPACE_DIR;
  if (workspace) return path.dirname(workspace);
  return path.join(os.homedir(), ".cygnus");
}

function statePath(): string {
  return path.join(dataDir(), "publish.json");
}

async function readState(): Promise<PublishState> {
  try {
    const raw = await fs.readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as PublishState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeState(state: PublishState): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

export async function publishConnection(): Promise<PublishConnection> {
  const state = await readState();
  const cloudflare = state.cloudflare;
  if (!cloudflare?.token) return { connected: false };
  return {
    connected: true,
    accountId: cloudflare.accountId,
    accountName: cloudflare.accountName,
  };
}

function cloudflareError(status: number, body: string): Error {
  let detail = body.replace(/\s+/g, " ").trim().slice(0, 280);
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: string }>;
    };
    const message = parsed.errors?.[0]?.message;
    if (message) detail = message;
  } catch {
    // Keep the raw body.
  }
  if (status === 401 || status === 403) {
    return new Error(
      `Cloudflare refused that token (${status}). Create a token with Account → Cloudflare Pages → Edit, then reconnect. ${detail}`,
    );
  }
  return new Error(`Cloudflare returned HTTP ${status}. ${detail}`);
}

async function cf<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const state = await readState();
  if (!state.cloudflare?.token) {
    throw new Error("Connect a Cloudflare account in Settings → Publish first.");
  }

  const response = await fetch(`${API}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${state.cloudflare.token}`,
      "User-Agent": "Cygnus",
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) throw cloudflareError(response.status, text);

  let data: { result?: T } = {};
  try {
    data = JSON.parse(text) as { result?: T };
  } catch {
    return undefined as T;
  }
  return data.result as T;
}

export async function connectCloudflare(
  token: string,
  accountId?: string,
): Promise<PublishConnection> {
  const cleaned = token.trim();
  if (!cleaned) throw new Error("Paste a Cloudflare API token first.");
  if (cleaned.length < 30) {
    throw new Error(
      "That is too short for a Cloudflare API token. Copy the full token (about 40 characters) from My Profile → API Tokens.",
    );
  }

  const verify = await fetch(`${API}/user/tokens/verify`, {
    headers: { Authorization: `Bearer ${cleaned}`, "User-Agent": "Cygnus" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!verify.ok) {
    throw cloudflareError(verify.status, await verify.text().catch(() => ""));
  }

  const accountsResponse = await fetch(`${API}/accounts?per_page=50`, {
    headers: { Authorization: `Bearer ${cleaned}`, "User-Agent": "Cygnus" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!accountsResponse.ok) {
    throw cloudflareError(accountsResponse.status, await accountsResponse.text().catch(() => ""));
  }
  const accountsPayload = (await accountsResponse.json().catch(() => ({}))) as {
    result?: CloudflareAccount[];
  };
  const accounts = (accountsPayload.result ?? []).filter(
    (account) => typeof account?.id === "string",
  );
  if (accounts.length === 0) {
    throw new Error(
      "That token works but no Cloudflare account is visible. Add the Account → Cloudflare Pages → Edit permission.",
    );
  }

  const chosen =
    accounts.find((account) => account.id === accountId) ?? (accounts.length === 1 ? accounts[0] : null);
  if (!chosen) {
    throw new Error(
      `This token can see ${accounts.length} accounts. Pick one: ${accounts
        .map((account) => `${account.name} (${account.id})`)
        .join(", ")}`,
    );
  }

  const state = await readState();
  await writeState({
    ...state,
    cloudflare: {
      token: cleaned,
      accountId: chosen.id,
      accountName: chosen.name,
    },
  });
  return { connected: true, accountId: chosen.id, accountName: chosen.name };
}

export async function listCloudflareAccounts(token: string): Promise<CloudflareAccount[]> {
  const response = await fetch(`${API}/accounts?per_page=50`, {
    headers: { Authorization: `Bearer ${token.trim()}`, "User-Agent": "Cygnus" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw cloudflareError(response.status, await response.text().catch(() => ""));
  const payload = (await response.json().catch(() => ({}))) as { result?: CloudflareAccount[] };
  return payload.result ?? [];
}

export async function disconnectCloudflare(): Promise<void> {
  const state = await readState();
  delete state.cloudflare;
  await writeState(state);
}

function pagesName(meta: ProjectMeta): string {
  const slug = meta.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/^-+|-+$/g, "");
  const base = slug || "app";
  return `cygnus-${base}-${meta.id}`.slice(0, 58).replace(/-+$/g, "");
}

export type PublishProgress = {
  type: "progress";
  phase: "check" | "project" | "upload" | "finish";
  status: string;
  percent: number | null;
};

export type PublishResult = {
  url: string;
  projectName: string;
  accountName?: string;
  files: number;
  bytes: number;
};

export async function publishProject(
  projectId: string,
  onProgress: (event: PublishProgress) => void,
): Promise<PublishResult> {
  const connection = await publishConnection();
  if (!connection.connected || !connection.accountId) {
    throw new Error("Connect a Cloudflare account before publishing.");
  }

  const meta = await readMeta(projectId);
  const files = await listFiles(projectId);
  if (files.length === 0) throw new Error("This project has no files to publish.");
  if (files.length > MAX_FILES) {
    throw new Error(`This project has ${files.length} files; the limit is ${MAX_FILES}.`);
  }
  if (!files.some((file) => file.path === "index.html")) {
    throw new Error("Publishing needs an index.html at the project root.");
  }

  const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
  if (oversized) {
    throw new Error(`${oversized.path} is larger than the 25 MiB per-file limit.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error("This project is over the 120 MB publishing limit.");
  }

  onProgress({ type: "progress", phase: "check", status: "Checking the project", percent: 5 });

  const accountId = connection.accountId;
  const projectName = meta.publish?.projectName ?? pagesName(meta);

  onProgress({ type: "progress", phase: "project", status: "Preparing the site", percent: 12 });
  try {
    await cf(`/accounts/${accountId}/pages/projects/${projectName}`);
  } catch {
    await cf(`/accounts/${accountId}/pages/projects`, {
      method: "POST",
      body: JSON.stringify({ name: projectName, production_branch: "main" }),
    });
  }

  const manifest: Record<string, string> = {};
  const blobs = new Map<string, Buffer>();
  let uploadedBytes = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const buffer = await readFileBytes(projectId, file.path);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    manifest[file.path] = hash;
    blobs.set(hash, buffer);
    uploadedBytes += buffer.length;

    onProgress({
      type: "progress",
      phase: "upload",
      status: `Reading ${file.path}`,
      percent: 15 + Math.round(((index + 1) / files.length) * 35),
    });
  }

  onProgress({ type: "progress", phase: "upload", status: "Uploading to Cloudflare", percent: 55 });

  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("branch", "main");
  form.append("commit_message", "Publish from Cygnus");
  for (const [hash, buffer] of blobs) {
    form.append(hash, new Blob([new Uint8Array(buffer)], { type: "application/octet-stream" }), hash);
  }

  const state = await readState();
  const response = await fetch(
    `${API}/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${state.cloudflare?.token ?? ""}`,
        "User-Agent": "Cygnus",
      },
      body: form,
      signal: AbortSignal.timeout(10 * 60 * 1000),
    },
  );

  if (!response.ok) {
    throw cloudflareError(response.status, await response.text().catch(() => ""));
  }

  const payload = (await response.json().catch(() => ({}))) as {
    result?: { url?: string; aliases?: string[] };
  };
  const url =
    payload.result?.aliases?.find((alias) => alias.includes("pages.dev")) ??
    payload.result?.url ??
    `https://${projectName}.pages.dev`;

  onProgress({ type: "progress", phase: "finish", status: "Saving the address", percent: 96 });

  await writeMeta({
    ...meta,
    publish: {
      provider: "cloudflare-pages",
      projectName,
      url: `https://${projectName}.pages.dev`,
      deployedAt: new Date().toISOString(),
    },
  });

  onProgress({ type: "progress", phase: "finish", status: "Live", percent: 100 });

  return {
    url: `https://${projectName}.pages.dev`,
    projectName,
    accountName: connection.accountName,
    files: files.length,
    bytes: uploadedBytes,
  };
}

export async function unpublishProject(projectId: string): Promise<void> {
  const meta = await readMeta(projectId);
  if (!meta.publish) throw new Error("This project is not published.");

  const connection = await publishConnection();
  if (!connection.connected || !connection.accountId) {
    throw new Error("Reconnect Cloudflare to remove the published site.");
  }

  await cf(
    `/accounts/${connection.accountId}/pages/projects/${meta.publish.projectName}`,
    { method: "DELETE" },
  );

  const next = { ...meta };
  delete next.publish;
  await writeMeta(next);
}
