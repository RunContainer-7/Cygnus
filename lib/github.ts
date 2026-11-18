import fs from "node:fs/promises";
import * as fsp from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectMeta } from "./types";
import {
  createProject,
  listFiles,
  readFileSafe,
  readMeta,
  writeFileSafe,
  writeMeta,
} from "./workspace";

/**
 * Cygnus talks to GitHub directly with a token the user creates. No Freebuff
 * account, OAuth app, or third-party relay is involved: the token is stored in
 * the Cygnus data folder on this computer and sent only to api.github.com.
 */

const API = "https://api.github.com";
const USER_AGENT = "Cygnus";
const TEXT_FILE =
  /\.(?:html?|css|js|mjs|cjs|jsx|tsx?|json|md|mdx|txt|svg|xml|ya?ml|toml|sh|py|rb|go|rs|java|kt|php|vue|svelte|astro)$/i;
const MAX_IMPORT_FILES = 120;
const MAX_IMPORT_BYTES = 300_000;

type GithubState = {
  token?: string;
  login?: string;
  name?: string;
  avatarUrl?: string;
};

export type GithubStatus = {
  connected: boolean;
  login?: string;
  name?: string;
  avatarUrl?: string;
};

export type GithubRepo = {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  description: string;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
};

function dataDir(): string {
  const workspace = process.env.CYGNUS_WORKSPACE_DIR;
  if (workspace) return path.dirname(workspace);
  return path.join(os.homedir(), ".cygnus");
}

function statePath(): string {
  return path.join(dataDir(), "github.json");
}

async function readState(): Promise<GithubState> {
  try {
    const raw = await fs.readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as GithubState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeState(state: GithubState): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify(state, null, 2), { mode: 0o600 });
  try {
    fsp.chmodSync(statePath(), 0o600);
  } catch {
    // Windows ACLs do not use POSIX modes.
  }
}

function statusFrom(state: GithubState): GithubStatus {
  if (!state.token) return { connected: false };
  return {
    connected: true,
    login: state.login,
    name: state.name,
    avatarUrl: state.avatarUrl,
  };
}

export async function githubStatus(): Promise<GithubStatus> {
  return statusFrom(await readState());
}

function githubError(status: number, body: string): Error {
  let detail = body.replace(/\s+/g, " ").trim().slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (typeof parsed.message === "string" && parsed.message) detail = parsed.message;
  } catch {
    // Keep the plain body.
  }
  if (status === 401) {
    return new Error(
      "GitHub rejected that token. Create a fine-grained token with read/write access to Contents and Metadata, then reconnect.",
    );
  }
  if (status === 403) {
    return new Error(`GitHub refused the request (403): ${detail}`);
  }
  if (status === 404) {
    return new Error(
      `GitHub could not find that repository, branch, or file (404). ${detail}`,
    );
  }
  return new Error(`GitHub returned HTTP ${status}. ${detail}`);
}

async function gh<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const state = await readState();
  if (!state.token) throw new Error("GitHub is not connected. Connect it in Settings first.");

  const response = await fetch(`${API}${endpoint}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw githubError(response.status, await response.text().catch(() => ""));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function ghText(endpoint: string): Promise<string> {
  const state = await readState();
  if (!state.token) throw new Error("GitHub is not connected. Connect it in Settings first.");
  const response = await fetch(`${API}${endpoint}`, {
    headers: {
      Accept: "application/vnd.github.raw",
      Authorization: `Bearer ${state.token}`,
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw githubError(response.status, await response.text().catch(() => ""));
  }
  return response.text();
}

export async function connectGithub(token: string): Promise<GithubStatus> {
  const cleaned = token.trim();
  if (!cleaned) throw new Error("Paste a GitHub token first.");
  if (!/^(gh[pousr]_|github_pat_)/.test(cleaned) && cleaned.length < 20) {
    throw new Error("That does not look like a GitHub token.");
  }

  const response = await fetch(`${API}/user`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cleaned}`,
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw githubError(response.status, await response.text().catch(() => ""));

  const user = (await response.json()) as {
    login?: string;
    name?: string | null;
    avatar_url?: string;
  };
  const state: GithubState = {
    token: cleaned,
    login: user.login ?? "",
    name: user.name ?? user.login ?? "",
    avatarUrl: user.avatar_url ?? "",
  };
  await writeState(state);
  return statusFrom(state);
}

export async function disconnectGithub(): Promise<void> {
  try {
    await fs.unlink(statePath());
  } catch {
    // Already disconnected.
  }
}

export async function listGithubRepos(): Promise<GithubRepo[]> {
  const repos = await gh<
    Array<{
      full_name?: string;
      name?: string;
      owner?: { login?: string };
      private?: boolean;
      description?: string | null;
      default_branch?: string;
      updated_at?: string;
      html_url?: string;
    }>
  >("/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");

  return (Array.isArray(repos) ? repos : [])
    .filter((repo) => typeof repo.full_name === "string")
    .map((repo) => ({
      fullName: repo.full_name!,
      name: repo.name ?? repo.full_name!.split("/")[1] ?? repo.full_name!,
      owner: repo.owner?.login ?? repo.full_name!.split("/")[0] ?? "",
      private: Boolean(repo.private),
      description: repo.description ?? "",
      defaultBranch: repo.default_branch ?? "main",
      updatedAt: repo.updated_at ?? "",
      htmlUrl: repo.html_url ?? `https://github.com/${repo.full_name}`,
    }));
}

export async function importGithubRepo(fullName: string): Promise<{
  project: ProjectMeta;
  files: number;
  skipped: number;
}> {
  const cleaned = fullName.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) {
    throw new Error("Use owner/repo, for example RunContainer-7/Cygnus.");
  }

  const repo = await gh<{ default_branch?: string; name?: string; html_url?: string }>(
    `/repos/${cleaned}`,
  );
  const branch = repo.default_branch || "main";
  const tree = await gh<{
    tree?: Array<{ path?: string; type?: string; size?: number }>;
    truncated?: boolean;
  }>(`/repos/${cleaned}/git/trees/${encodeURIComponent(branch)}?recursive=1`);

  const blobs = (tree.tree ?? []).filter(
    (entry) =>
      entry.type === "blob" &&
      typeof entry.path === "string" &&
      TEXT_FILE.test(entry.path) &&
      !/(^|\/)(node_modules|\.git|dist|build|\.next|vendor|\.venv)\//.test(entry.path) &&
      (entry.size ?? 0) <= MAX_IMPORT_BYTES &&
      !entry.path.split("/").some((part) => part.startsWith(".")),
  );

  if (!blobs.some((entry) => entry.path === "index.html")) {
    throw new Error(
      "That repository has no index.html at its root. Cygnus previews static sites, so pick a repo with a static entry page.",
    );
  }

  const selected = blobs.slice(0, MAX_IMPORT_FILES);
  const project = await createProject(repo.name ?? cleaned.split("/")[1]);

  let files = 0;
  for (const entry of selected) {
    const filePath = entry.path!;
    try {
      const content = await ghText(
        `/repos/${cleaned}/contents/${filePath
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/")}?ref=${encodeURIComponent(branch)}`,
      );
      await writeFileSafe(project.id, filePath, content);
      files += 1;
    } catch {
      // A file can disappear between tree and contents calls; keep going.
    }
  }

  if (files === 0) throw new Error("None of that repository's files could be imported.");

  const meta: ProjectMeta = {
    ...project,
    github: { repo: cleaned, branch, htmlUrl: repo.html_url },
  };
  await writeMeta(meta);

  return { project: meta, files, skipped: blobs.length - selected.length };
}

export async function pushProject(projectId: string): Promise<{
  repo: string;
  branch: string;
  commitUrl: string;
  files: number;
}> {
  const meta = await readMeta(projectId);
  if (!meta.github?.repo) {
    throw new Error(
      "This project is not linked to GitHub yet. Import a repo, or link one from Setup → GitHub.",
    );
  }

  const repo = meta.github.repo;
  const branch = meta.github.branch || "main";
  const files = (await listFiles(projectId)).filter(
    (file) => TEXT_FILE.test(file.path) && file.size <= MAX_IMPORT_BYTES,
  );

  const ref = await gh<{ object?: { sha?: string } }>(
    `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  const headSha = ref.object?.sha;
  if (!headSha) throw new Error(`GitHub returned no head commit for ${branch}.`);

  const parent = await gh<{ tree?: { sha?: string } }>(`/repos/${repo}/git/commits/${headSha}`);
  const baseTree = parent.tree?.sha;

  const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  for (const file of files) {
    const content = await readFileSafe(projectId, file.path);
    const blob = await gh<{ sha?: string }>(`/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    if (!blob.sha) throw new Error(`GitHub did not store ${file.path}.`);
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await gh<{ sha?: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ ...(baseTree ? { base_tree: baseTree } : {}), tree: entries }),
  });
  if (!tree.sha) throw new Error("GitHub did not create a tree for this commit.");

  const commit = await gh<{ sha?: string; html_url?: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: "Update from Cygnus",
      tree: tree.sha,
      parents: [headSha],
    }),
  });
  if (!commit.sha) throw new Error("GitHub did not create the commit.");

  await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    repo,
    branch,
    commitUrl: commit.html_url ?? `https://github.com/${repo}/commit/${commit.sha}`,
    files: entries.length,
  };
}

export async function linkProjectRepo(
  projectId: string,
  fullName: string,
  branch?: string,
): Promise<ProjectMeta> {
  const meta = await readMeta(projectId);
  const repo = await gh<{ default_branch?: string; html_url?: string }>(`/repos/${fullName}`);
  const next: ProjectMeta = {
    ...meta,
    github: {
      repo: fullName,
      branch: branch?.trim() || repo.default_branch || "main",
      htmlUrl: repo.html_url,
    },
  };
  await writeMeta(next);
  return next;
}
