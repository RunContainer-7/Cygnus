import { normalizeBaseUrl } from "./endpoints";
import { OPEN_SOURCE_MODELS } from "./modelCatalog";

export type BuildMode = "chat" | "plan" | "build";

export type ModeDefinition = {
  id: BuildMode;
  label: string;
  hint: string;
  short: string;
};

export const BUILD_MODES: ModeDefinition[] = [
  {
    id: "chat",
    label: "Chat",
    hint: "Talk it through. Nothing in the project changes.",
    short: "Conversation only",
  },
  {
    id: "plan",
    label: "Plan",
    hint: "Read the project and lay out the steps. No file edits.",
    short: "Read-only planning",
  },
  {
    id: "build",
    label: "Build",
    hint: "Write files, test the app, and iterate.",
    short: "Writes files",
  },
];

export const DEFAULT_MODE: BuildMode = "chat";
const MODE_KEY = "cygnus.build-mode.v1";

export function isBuildMode(value: unknown): value is BuildMode {
  return value === "chat" || value === "plan" || value === "build";
}

export function loadMode(): BuildMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const stored = window.localStorage.getItem(MODE_KEY);
    return isBuildMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function saveMode(mode: BuildMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // The preference is optional.
  }
}

/**
 * Chat needs no tools. Plan needs read-only tools. Build needs the full set.
 * Chat-only models (and the tiny experimental Cygnus model) can therefore only
 * run Chat, and the picker disables the rest.
 */
export function supportedModes(provider: { baseUrl: string; model: string }): BuildMode[] {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const entry = OPEN_SOURCE_MODELS.find(
    (item) =>
      normalizeBaseUrl(item.baseUrl) === baseUrl &&
      (item.model === provider.model || item.tag === provider.model),
  );

  if (!entry) return ["chat", "plan", "build"];
  if (entry.access === "cygnus") return ["chat"];
  if (entry.kind && entry.kind !== "agent") return ["chat"];
  if (entry.tools === false) return ["chat"];
  return ["chat", "plan", "build"];
}

export function modeDisabledReason(
  mode: BuildMode,
  providerLabelText: string,
): string | null {
  if (mode === "chat") return null;
  return `${providerLabelText} cannot call tools, so it can't run ${mode === "plan" ? "Plan" : "Build"} mode.`;
}