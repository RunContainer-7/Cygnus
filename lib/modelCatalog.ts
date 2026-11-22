import {
  HOSTED_BASE_URL,
  HOSTED_MODELS,
  type HostedTier,
} from "./hosted";
import {
  CYGNUS_LOCAL_BASE_URL,
  CYGNUS_LOCAL_LABEL,
  CYGNUS_LOCAL_MODEL,
} from "./cygnus05Shared";
import {
  OPEN_SOURCE_BASE_URL,
  OPEN_SOURCE_ENGINE_MODELS,
  type OpenSourceFamily,
  type OpenSourceKind,
} from "./openSource";
import {
  HARDCODED_BASE_URL,
  HARDCODED_LABEL,
  HARDCODED_MODEL,
} from "./hardcodedShared";

export type ModelTier = HostedTier;
export type ModelAccess =
  | "hosted"
  | "open"
  | "cygnus"
  | "hardcoded"
  | "local"
  | "byok"
  | "demo";

export type OpenModel = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  tier: ModelTier;
  access: ModelAccess;
  recommended?: boolean;
  badge?: string;
  /** Visual tone of the badge. `warn` paints it red. */
  tone?: "warn";
  note: string;
  family?: OpenSourceFamily;
  kind?: OpenSourceKind;
  size?: string;
  minRamGb?: number;
  tag?: string;
  experimental?: boolean;
  tools?: boolean;
};

export const MODEL_TIERS: Array<{ id: ModelTier; label: string; hint: string }> = [
  {
    id: "low",
    label: "Low",
    hint: "Small and fast. Good for tight edits and quick drafts.",
  },
  {
    id: "balanced",
    label: "Balanced",
    hint: "The everyday tier for multi-file app builds.",
  },
  {
    id: "max",
    label: "Max",
    hint: "The strongest open-weight models, for long builds.",
  },
];

const HOSTED_ENTRIES: OpenModel[] = HOSTED_MODELS.map((entry) => ({
  id: `hosted-${entry.id}`,
  name: entry.name,
  provider: "Cygnus Hosted",
  baseUrl: HOSTED_BASE_URL,
  model: entry.id,
  tier: entry.tier,
  access: "hosted",
  recommended: entry.recommended,
  badge: entry.badge,
  note: entry.note,
}));

const CYGNUS_ENTRIES: OpenModel[] = [
  {
    id: "cygnus-0.5",
    name: CYGNUS_LOCAL_LABEL,
    provider: "Cygnus Labs",
    baseUrl: CYGNUS_LOCAL_BASE_URL,
    model: CYGNUS_LOCAL_MODEL,
    tier: "low",
    access: "cygnus",
    badge: "Not recommended",
    tone: "warn",
    note: "5.3M parameters trained from random weights on this PC. Chat only; not recommended for real work.",
    family: "Cygnus",
    kind: "chat",
    tools: false,
    size: "21 MB",
    minRamGb: 1,
    experimental: true,
  },
];

const HARDCODED_ENTRIES: OpenModel[] = [
  {
    id: "hardcoded-intelligence",
    name: HARDCODED_LABEL,
    provider: "Cygnus Labs",
    baseUrl: HARDCODED_BASE_URL,
    model: HARDCODED_MODEL,
    tier: "low",
    access: "hardcoded",
    badge: "Not recommended",
    tone: "warn",
    note: "No model and no network: deterministic rules and hand-written app templates. Instant and offline, but it only handles patterns it was written for.",
    family: "Cygnus",
    kind: "agent",
    tools: true,
    size: "0 MB",
    minRamGb: 0,
    experimental: true,
  },
];

const ON_DEVICE_ENTRIES: OpenModel[] = OPEN_SOURCE_ENGINE_MODELS.map((entry) => ({
  id: `open-${entry.id}`,
  name: entry.name,
  provider: "On this PC",
  baseUrl: OPEN_SOURCE_BASE_URL,
  model: entry.tag,
  tier: entry.tier,
  access: "open",
  recommended: entry.recommended,
  badge: entry.badge,
  tone: entry.tone,
  note: entry.note,
  family: entry.family,
  kind: entry.kind,
  size: entry.size,
  minRamGb: entry.minRamGb,
  tag: entry.tag,
  tools: entry.tools,
}));

/**
 * The composer picker. Hosted entries are free shared cloud capacity; open
 * entries download and run on this computer; local entries are connections to
 * Ollama or LM Studio only. BYOK is deliberately not a model list: the picker
 * reads one pasted key and detects the provider/model instead.
 */
export const OPEN_SOURCE_MODELS: OpenModel[] = [
  ...HOSTED_ENTRIES,
  ...CYGNUS_ENTRIES,
  ...HARDCODED_ENTRIES,
  ...ON_DEVICE_ENTRIES,
  {
    id: "offline-demo",
    name: "Offline demo",
    provider: "Cygnus",
    baseUrl: "demo",
    model: "cygnus-demo",
    tier: "low",
    access: "demo",
    badge: "No model",
    note: "Writes a sample project with no model call. Useful when every engine and key is unavailable.",
  },
  {
    id: "local-ollama",
    name: "Ollama",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "local-model",
    tier: "low",
    access: "local",
    note: "Use the model already installed in Ollama.",
  },
  {
    id: "local-lmstudio",
    name: "LM Studio",
    provider: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    tier: "low",
    access: "local",
    note: "Use the model loaded in LM Studio.",
  },
];
