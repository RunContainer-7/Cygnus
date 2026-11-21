import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  OPEN_SOURCE_BASE_URL,
  OPEN_SOURCE_ENGINE_MODELS,
  ramFits,
  type OpenSourceEngineStatus,
  type OpenSourceModel,
  type OpenSourceProgress,
  type OpenSourceStatus,
} from "./openSource";

const ENGINE_HOST = "127.0.0.1";
const ENGINE_PORT = 11434;
const ENGINE_ORIGIN = `http://${ENGINE_HOST}:${ENGINE_PORT}`;
const ENGINE_ZIP = "ollama-windows-amd64.zip";
const ENGINE_DOWNLOAD_FALLBACK = `https://github.com/ollama/ollama/releases/latest/download/${ENGINE_ZIP}`;

type EngineState = {
  child: ChildProcess | null;
  starting: Promise<OpenSourceEngineStatus> | null;
  installing: Promise<void> | null;
  pulling: Map<string, Promise<void>>;
  binary: string | null;
  version: string | null;
  cleanupRegistered: boolean;
};

const store = globalThis as unknown as { __cygnusLocalEngine?: EngineState };

function state(): EngineState {
  store.__cygnusLocalEngine ??= {
    child: null,
    starting: null,
    installing: null,
    pulling: new Map(),
    binary: null,
    version: null,
    cleanupRegistered: false,
  };
  return store.__cygnusLocalEngine;
}

function dataDir(): string {
  const workspace = process.env.CYGNUS_WORKSPACE_DIR;
  if (workspace) return path.dirname(workspace);
  return path.join(os.homedir(), ".cygnus");
}

function runtimeDir(): string {
  return path.join(dataDir(), "runtime", "ollama");
}

function modelsDir(): string {
  return path.join(dataDir(), "models");
}

function logPath(): string {
  return path.join(dataDir(), "engine.log");
}

function roundRam(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function appendLog(chunk: unknown): void {
  try {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    fs.appendFileSync(logPath(), text);
  } catch {
    // Logging must never stop inference.
  }
}

function readLogTail(limit = 1600): string {
  try {
    const size = fs.statSync(logPath()).size;
    const start = Math.max(0, size - limit);
    const buffer = Buffer.alloc(size - start);
    const fd = fs.openSync(logPath(), "r");
    try {
      fs.readSync(fd, buffer, 0, buffer.length, start);
    } finally {
      fs.closeSync(fd);
    }
    return buffer.toString("utf8").trim();
  } catch {
    return "";
  }
}

async function prepareLog(): Promise<void> {
  try {
    await fsp.mkdir(path.dirname(logPath()), { recursive: true });
    const info = await fsp.stat(logPath());
    if (info.size > 2_000_000) {
      await fsp.rename(logPath(), `${logPath()}.old`).catch(() => undefined);
    }
  } catch {
    // A missing log is normal on first run.
  }
}

async function probeEngine(): Promise<{ version: string } | null> {
  try {
    const response = await fetch(`${ENGINE_ORIGIN}/api/version`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => ({}))) as { version?: unknown };
    return { version: typeof data.version === "string" ? data.version : "unknown" };
  } catch {
    return null;
  }
}

async function listInstalledModels(): Promise<string[] | null> {
  try {
    // A big model makes the engine scan a large blob store, so this can take
    // much longer than a trivial request; a short timeout would look empty.
    const response = await fetch(`${ENGINE_ORIGIN}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as
      | { models?: Array<{ name?: unknown; model?: unknown }> }
      | null;
    return Array.from(
      new Set(
        (data?.models ?? [])
          .map((entry) => entry.name ?? entry.model)
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim())),
      ),
    );
  } catch {
    return null;
  }
}

/** Verify a finished install, giving the engine time to write its manifest. */
async function waitForModel(tag: string): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const installed = await listInstalledModels();
    if (installed?.some((name) => sameModel(name, tag))) return true;
    if (attempt < 5) await delay(1_500);
  }
  return false;
}

async function findFile(directory: string, name: string, depth = 0): Promise<string | null> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
      return path.join(directory, entry.name);
    }
  }

  if (depth >= 4) return null;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findFile(path.join(directory, entry.name), name, depth + 1);
    if (found) return found;
  }
  return null;
}

async function findBinary(): Promise<string | null> {
  const current = state();
  if (current.binary && (await exists(current.binary))) return current.binary;

  const managed = await findFile(runtimeDir(), "ollama.exe");
  if (managed) {
    current.binary = managed;
    return managed;
  }

  const candidates: string[] = [];
  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"));
    }
    if (process.env.ProgramFiles) {
      candidates.push(path.join(process.env.ProgramFiles, "Ollama", "ollama.exe"));
    }
  } else {
    candidates.push("/usr/local/bin/ollama", "/usr/bin/ollama", "/opt/homebrew/bin/ollama");
  }

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      current.binary = candidate;
      return candidate;
    }
  }

  const located = spawnSync(process.platform === "win32" ? "where" : "which", ["ollama"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const first = located.stdout
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (first && (await exists(first))) {
    current.binary = first;
    return first;
  }

  return null;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, ENGINE_HOST);
  });
}

type RunOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

function run(command: string, args: string[], options: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
    });
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // The child may already be gone.
        }
        finish(new Error(`${command} timed out after ${Math.round((options.timeoutMs ?? 0) / 1000)} seconds.`));
      }, options.timeoutMs);
    }
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error(`${command} exited with code ${code ?? "unknown"}. ${stderr.slice(-600)}`));
      }
    });
  });
}

async function extractZip(zipPath: string, destination: string): Promise<void> {
  await fsp.mkdir(destination, { recursive: true });

  if (process.platform === "win32") {
    try {
      await run("tar.exe", ["-xf", zipPath, "-C", destination]);
      return;
    } catch {
      // Older Windows builds may not ship tar; PowerShell is the fallback.
    }
    const quote = (value: string) => value.replace(/'/g, "''");
    await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath '${quote(zipPath)}' -DestinationPath '${quote(destination)}' -Force`,
    ]);
    return;
  }

  await run("unzip", ["-o", zipPath, "-d", destination]);
}

async function engineDownloadUrl(): Promise<string> {
  try {
    const response = await fetch("https://api.github.com/repos/ollama/ollama/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Cygnus",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        assets?: Array<{ name?: unknown; browser_download_url?: unknown }>;
      };
      const asset = (data.assets ?? []).find(
        (entry) =>
          typeof entry.name === "string" &&
          /^ollama-windows-amd64\.zip$/i.test(entry.name) &&
          typeof entry.browser_download_url === "string",
      );
      if (asset && typeof asset.browser_download_url === "string") {
        return asset.browser_download_url;
      }
    }
  } catch {
    // Fall back to GitHub's stable latest-download URL.
  }
  return ENGINE_DOWNLOAD_FALLBACK;
}

type ByteProgress = {
  status: string;
  completed?: number;
  total?: number;
};

async function download(url: string, destination: string, onProgress: (event: ByteProgress) => void) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Cygnus" },
    signal: AbortSignal.timeout(45 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`The local engine download failed (HTTP ${response.status}).`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  let completed = 0;
  let lastReport = 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      completed += chunk.length;
      const now = Date.now();
      if (now - lastReport >= 250 || (total > 0 && completed >= total)) {
        lastReport = now;
        onProgress({ status: "Downloading the local engine", completed, total });
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
    counter,
    fs.createWriteStream(destination),
  );
  if (total > 0 && completed !== total) {
    await fsp.unlink(destination).catch(() => undefined);
    throw new Error(
      `The local engine download stopped at ${completed} of ${total} bytes. Check the connection and try again.`,
    );
  }
  onProgress({ status: "Downloaded the local engine", completed, total });
}

async function installEngine(onProgress: (event: ByteProgress) => void): Promise<void> {
  const current = state();
  if (await findBinary()) return;
  if (current.installing) return current.installing;

  current.installing = (async () => {
    if (process.platform !== "win32") {
      throw new Error(
        "Automatic engine setup is available on Windows. Install Ollama from ollama.com/download and Cygnus will detect it.",
      );
    }

    await prepareLog();
    await fsp.mkdir(runtimeDir(), { recursive: true });
    const zipPath = path.join(dataDir(), ENGINE_ZIP);
    const url = await engineDownloadUrl();

    onProgress({ status: "Downloading the local engine", completed: 0, total: 0 });
    await download(url, zipPath, onProgress);

    onProgress({ status: "Extracting the local engine" });
    await extractZip(zipPath, runtimeDir());
    await fsp.unlink(zipPath).catch(() => undefined);

    const binary = await findFile(runtimeDir(), "ollama.exe");
    if (!binary) {
      throw new Error("The downloaded engine did not contain ollama.exe.");
    }
    current.binary = binary;
  })().finally(() => {
    current.installing = null;
  });

  return current.installing;
}

async function startEngine(): Promise<OpenSourceEngineStatus> {
  const current = state();
  const running = await probeEngine();
  if (running) {
    current.version = running.version;
    return {
      installed: true,
      running: true,
      baseUrl: OPEN_SOURCE_BASE_URL,
      version: running.version,
      managed: Boolean(current.child),
    };
  }

  if (current.starting) return current.starting;

  current.starting = (async () => {
    const binary = await findBinary();
    if (!binary) {
      return {
        installed: false,
        running: false,
        baseUrl: OPEN_SOURCE_BASE_URL,
        managed: false,
      };
    }

    if (!(await isPortFree(ENGINE_PORT))) {
      throw new Error(
        `Port ${ENGINE_PORT} is already in use by another app. Close it and try again, or install Ollama on its default port.`,
      );
    }

    await prepareLog();
    await fsp.mkdir(modelsDir(), { recursive: true });

    const child = spawn(/* turbopackIgnore: true */ binary, ["serve"], {
      cwd: path.dirname(binary),
      env: {
        ...process.env,
        OLLAMA_HOST: `${ENGINE_HOST}:${ENGINE_PORT}`,
        OLLAMA_MODELS: modelsDir(),
        OLLAMA_KEEP_ALIVE: "10m",
        // Ollama defaults to a 4096-token context. Cygnus's builder prompt and
        // one tool result already fill that, which silently truncates the
        // system rules mid-build. Give local models room for a full turn.
        OLLAMA_CONTEXT_LENGTH: "16384",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    current.child = child;
    child.stdout?.on("data", appendLog);
    child.stderr?.on("data", appendLog);
    child.once("error", (error) => appendLog(`engine spawn error: ${error.message}\n`));
    child.once("exit", (code, signal) => {
      appendLog(`engine exited code=${code ?? "null"} signal=${signal ?? "none"}\n`);
      if (current.child === child) current.child = null;
    });

    const startedAt = Date.now();
    while (Date.now() - startedAt < 45_000) {
      const probe = await probeEngine();
      if (probe) {
        current.version = probe.version;
        return {
          installed: true,
          running: true,
          baseUrl: OPEN_SOURCE_BASE_URL,
          version: probe.version,
          managed: true,
        };
      }
      if (current.child === null) break;
      await delay(500);
    }

    try {
      child.kill();
    } catch {
      // The child may already be gone.
    }
    if (current.child === child) current.child = null;
    const tail = readLogTail();
    throw new Error(
      `The local engine did not start within 45 seconds.${tail ? `\n\n${tail}` : ""}`,
    );
  })().finally(() => {
    current.starting = null;
  });

  return current.starting;
}

async function ensureEngine(onProgress: (event: ByteProgress) => void): Promise<OpenSourceEngineStatus> {
  const running = await probeEngine();
  if (running) {
    const current = state();
    current.version = running.version;
    return {
      installed: true,
      running: true,
      baseUrl: OPEN_SOURCE_BASE_URL,
      version: running.version,
      managed: Boolean(current.child),
    };
  }

  if (!(await findBinary())) {
    await installEngine(onProgress);
  }
  onProgress({ status: "Starting the local engine" });
  return startEngine();
}

function sameModel(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  return a === b || a === `${b}:latest` || b === `${a}:latest`;
}

function percent(completed?: number, total?: number): number | null {
  if (typeof completed !== "number" || typeof total !== "number" || total <= 0) return null;
  if (completed >= total) return 100;
  return Math.max(0, Math.min(99, Math.round((completed / total) * 100)));
}

async function pullModel(
  model: OpenSourceModel,
  onProgress: (event: ByteProgress) => void,
): Promise<void> {
  const installed = await listInstalledModels();
  if (installed?.some((name) => sameModel(name, model.tag))) return;

  const current = state();
  const active = current.pulling.get(model.id);
  if (active) return active;

  const promise = (async () => {
    const response = await fetch(`${ENGINE_ORIGIN}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.tag, stream: true }),
      signal: AbortSignal.timeout(12 * 60 * 60 * 1000),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Could not download ${model.name} (HTTP ${response.status}). ${detail
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240)}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;
      let event: {
        status?: unknown;
        completed?: unknown;
        total?: unknown;
        error?: unknown;
      };
      try {
        event = JSON.parse(line) as typeof event;
      } catch {
        return;
      }
      if (typeof event.error === "string" && event.error) {
        throw new Error(event.error);
      }
      onProgress({
        status: typeof event.status === "string" ? event.status : "Downloading model",
        completed: typeof event.completed === "number" ? event.completed : undefined,
        total: typeof event.total === "number" ? event.total : undefined,
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    if (buffer.trim()) handleLine(buffer);

    if (!(await waitForModel(model.tag))) {
      throw new Error(`${model.name} finished downloading but the engine did not list it.`);
    }
  })().finally(() => {
    current.pulling.delete(model.id);
  });

  current.pulling.set(model.id, promise);
  return promise;
}

async function installGgufModel(
  model: OpenSourceModel,
  onProgress: (event: ByteProgress) => void,
): Promise<void> {
  const installed = await listInstalledModels();
  if (installed?.some((name) => sameModel(name, model.tag))) return;

  const current = state();
  const active = current.pulling.get(model.id);
  if (active) return active;

  const promise = (async () => {
    const gguf = model.gguf;
    if (!gguf) throw new Error(`${model.name} has no download configured.`);

    const dir = modelsDir();
    await fsp.mkdir(dir, { recursive: true });
    const target = path.join(dir, `${model.id}.gguf`);
    // Older builds saved the archive under the home folder even when the
    // engine used a different data folder. Reuse that file instead of
    // downloading another 531 MB.
    const legacy = path.join(os.homedir(), ".cygnus", "models", `${model.id}.gguf`);
    const expected = gguf.bytes ?? 0;

    const isComplete = async (file: string): Promise<boolean> => {
      try {
        const info = await fsp.stat(file);
        return expected > 0 ? info.size === expected : info.size > 0;
      } catch {
        return false;
      }
    };

    let source: string | null = null;
    for (const candidate of [target, legacy]) {
      if (await isComplete(candidate)) {
        source = candidate;
        break;
      }
    }

    if (!source) {
      const response = await fetch(gguf.url, {
        signal: AbortSignal.timeout(12 * 60 * 60 * 1000),
        redirect: "follow",
      });
      if (!response.ok || !response.body) {
        throw new Error(
          `Could not download ${model.name} (HTTP ${response.status}). Check the connection and try again.`,
        );
      }

      const total = expected || Number(response.headers.get("content-length") ?? 0) || undefined;
      const temp = `${target}.part`;
      let completed = 0;
      let lastReport = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          completed += chunk.length;
          const now = Date.now();
          if (now - lastReport >= 250 || (total !== undefined && completed >= total)) {
            lastReport = now;
            onProgress({ status: `Downloading ${model.name}`, completed, total });
          }
          callback(null, chunk);
        },
      });

      try {
        await pipeline(
          Readable.from(response.body as unknown as AsyncIterable<Uint8Array>),
          counter,
          fs.createWriteStream(temp),
        );
      } catch (error) {
        await fsp.unlink(temp).catch(() => undefined);
        throw error;
      }
      onProgress({ status: `Downloading ${model.name}`, completed, total });

      if (expected > 0 && completed !== expected) {
        await fsp.unlink(temp).catch(() => undefined);
        throw new Error(
          `${model.name} stopped at ${completed} of ${expected} bytes. Check the connection and try again.`,
        );
      }
      await fsp.rename(temp, target);
      source = target;
    }

    // Ollama 0.40 dropped the Modelfile field from /api/create: it only
    // accepts a pushed blob digest. The engine's own CLI hashes and imports
    // the GGUF the way that version expects, so use it to build the model.
    onProgress({ status: `Building ${model.name}` });

    const binary = await findBinary();
    if (!binary) throw new Error("The local engine is not installed.");

    const modelfilePath = path.join(dir, `${model.id}.Modelfile`);
    const modelfile = [
      `FROM ${source}`,
      `SYSTEM """${gguf.system}"""`,
      "PARAMETER temperature 0.7",
      "PARAMETER top_p 0.9",
      "PARAMETER repeat_penalty 1.1",
    ].join("\n");
    await fsp.writeFile(modelfilePath, modelfile, "utf8");

    try {
      await run(binary, ["create", model.tag, "-f", modelfilePath], {
        env: {
          ...process.env,
          OLLAMA_HOST: `${ENGINE_HOST}:${ENGINE_PORT}`,
          OLLAMA_MODELS: dir,
        },
        timeoutMs: 30 * 60 * 1000,
      });
    } finally {
      await fsp.unlink(modelfilePath).catch(() => undefined);
    }

    if (!(await waitForModel(model.tag))) {
      throw new Error(`${model.name} was built but the engine did not list it.`);
    }
  })().finally(() => {
    current.pulling.delete(model.id);
  });

  current.pulling.set(model.id, promise);
  return promise;
}

export async function getOpenSourceStatus(): Promise<OpenSourceStatus> {
  let engine: OpenSourceEngineStatus;
  try {
    engine = await startEngine();
  } catch (error) {
    engine = {
      installed: Boolean(await findBinary()),
      running: false,
      baseUrl: OPEN_SOURCE_BASE_URL,
      error: error instanceof Error ? error.message : "The local engine could not start.",
    };
  }

  const models = engine.running ? ((await listInstalledModels()) ?? []) : [];
  return {
    engine,
    models,
    totalRamGb: roundRam(os.totalmem()),
  };
}

export async function prepareModel(
  id: string,
  onProgress: (event: OpenSourceProgress) => void,
): Promise<{ baseUrl: string; model: string }> {
  const model = OPEN_SOURCE_ENGINE_MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error("That on-device model is not in the catalog.");

  const availableRamGb = roundRam(os.totalmem());
  if (!ramFits(availableRamGb, model.minRamGb)) {
    throw new Error(
      `${model.name} needs about ${model.minRamGb} GB of RAM. This PC has ${availableRamGb} GB. Pick a smaller model or use BYOK.`,
    );
  }

  onProgress({
    type: "progress",
    phase: "engine",
    percent: null,
    status: "Checking the local engine",
  });

  await ensureEngine((event) => {
    onProgress({
      type: "progress",
      phase: "engine",
      percent: percent(event.completed, event.total),
      status: event.status,
      completed: event.completed,
      total: event.total,
    });
  });

  onProgress({
    type: "progress",
    phase: "model",
    percent: null,
    status: `Preparing ${model.name}`,
  });

  const report = (event: ByteProgress) => {
    onProgress({
      type: "progress",
      phase: "model",
      percent: percent(event.completed, event.total),
      status: event.status,
      completed: event.completed,
      total: event.total,
    });
  };

  if (model.gguf) await installGgufModel(model, report);
  else await pullModel(model, report);

  return { baseUrl: OPEN_SOURCE_BASE_URL, model: model.tag };
}

function stopManagedEngine(): void {
  const current = state();
  const child = current.child;
  if (!child) return;
  try {
    child.kill();
  } catch {
    // The child may already be gone.
  }
  current.child = null;
}

if (!state().cleanupRegistered) {
  state().cleanupRegistered = true;
  process.once("exit", stopManagedEngine);
  process.once("SIGTERM", stopManagedEngine);
  process.once("SIGINT", stopManagedEngine);
}
