import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataDir } from "./appData";
import {
  EXTENSION_IDS,
  EXTENSIONS,
  extensionById,
  type InstalledExtensionPrompt,
} from "./extensions";

const STORE_FILE = "extensions.json";

function storePath(): string {
  return path.join(appDataDir(), STORE_FILE);
}

/** Unknown ids are ignored so an old or hand-edited file cannot inject prompt text. */
export async function readInstalledExtensions(): Promise<string[]> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as { installed?: unknown };
    if (!Array.isArray(parsed.installed)) return [];
    const seen = new Set<string>();
    for (const value of parsed.installed) {
      if (typeof value === "string" && EXTENSION_IDS.has(value)) seen.add(value);
    }
    return EXTENSIONS.map((extension) => extension.id).filter((id) => seen.has(id));
  } catch {
    return [];
  }
}

export async function setExtensionInstalled(
  id: string,
  installed: boolean,
): Promise<string[]> {
  if (!extensionById(id)) throw new Error("Unknown extension.");
  const current = await readInstalledExtensions();
  const next = installed
    ? [...current.filter((entry) => entry !== id), id]
    : current.filter((entry) => entry !== id);

  await fs.mkdir(appDataDir(), { recursive: true });
  await fs.writeFile(
    storePath(),
    `${JSON.stringify({ installed: next, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  return next;
}

export async function getInstalledExtensionPrompts(): Promise<InstalledExtensionPrompt[]> {
  const installed = await readInstalledExtensions();
  return installed
    .map((id) => extensionById(id))
    .filter((extension): extension is NonNullable<typeof extension> => Boolean(extension))
    .map((extension) => ({
      name: extension.name,
      version: extension.version,
      prompt: extension.prompt,
    }));
}
