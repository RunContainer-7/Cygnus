import {
  HOSTED_BASE_URL,
  HOSTED_MODELS,
  type HostedTier,
} from "./hosted";
import {
  OPEN_SOURCE_BASE_URL,
  OPEN_SOURCE_ENGINE_MODELS,
  type OpenSourceFamily,
  type OpenSourceKind,
} from "./openSource";

export type ModelTier = HostedTier;
export type ModelAccess = "hosted" | "open" | "local" | "byok";

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
  note: string;
  family?: OpenSourceFamily;
  kind?: OpenSourceKind;
  size?: string;
  minRamGb?: number;
  tag?: string;
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
  note: entry.note,
  family: entry.family,
  kind: entry.kind,
  size: entry.size,
  minRamGb: entry.minRamGb,
  tag: entry.tag,
}));

/**
 * The composer picker. Hosted entries are free shared cloud capacity; open
 * entries download and run on this computer; local entries are connections to
 * Ollama or LM Studio only. BYOK is deliberately not a model list: the picker
 * reads one pasted key and detects the provider/model instead.
 */
export const OPEN_SOURCE_MODELS: OpenModel[] = [
  ...HOSTED_ENTRIES,
  ...ON_DEVICE_ENTRIES,
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
