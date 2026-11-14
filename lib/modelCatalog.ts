import {
  HOSTED_BASE_URL,
  HOSTED_MODELS,
  type HostedTier,
} from "./hosted";

export type ModelTier = HostedTier;
export type ModelAccess = "hosted" | "local" | "byok";

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

/**
 * Only open-weight models belong here. Proprietary cloud models stay in the
 * full Settings surface, not the composer picker.
 *
 * Hosted entries need no key. Local entries talk to a server on this machine.
 * BYOK entries use a provider key saved in this browser.
 */
export const OPEN_SOURCE_MODELS: OpenModel[] = [
  ...HOSTED_ENTRIES,
  {
    id: "ollama-qwen7b",
    name: "Qwen2.5 Coder 7B",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:7b",
    tier: "low",
    access: "local",
    note: "Runs offline on an 8 GB machine.",
  },
  {
    id: "lmstudio-local",
    name: "LM Studio",
    provider: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    tier: "low",
    access: "local",
    note: "Uses the model currently loaded in LM Studio.",
  },
  {
    id: "groq-llama8b",
    name: "Llama 3.1 8B",
    provider: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    tier: "low",
    access: "byok",
    note: "Hosted Llama. Fast drafts, needs your Groq key.",
  },
  {
    id: "deepseek-flash",
    name: "DeepSeek V4.1 Flash",
    provider: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    tier: "balanced",
    access: "byok",
    note: "Strong coding, long context, needs your DeepSeek key.",
  },
  {
    id: "groq-llama70b",
    name: "Llama 3.3 70B",
    provider: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    tier: "balanced",
    access: "byok",
    note: "Hosted Llama for bigger changes, needs your Groq key.",
  },
  {
    id: "cerebras-qwen27b",
    name: "Qwen3 27B",
    provider: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "qwen-3.8-27b",
    tier: "balanced",
    access: "byok",
    badge: "New",
    note: "Very fast open-weight inference, needs your Cerebras key.",
  },
  {
    id: "ollama-qwen14b",
    name: "Qwen2.5 Coder 14B",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:14b",
    tier: "balanced",
    access: "local",
    note: "A bigger local model for stronger edits.",
  },
  {
    id: "respan-gateway",
    name: "Respan Gateway",
    provider: "Respan",
    baseUrl: "http://127.0.0.1:8787/v1",
    model: "cygnus-agent",
    tier: "balanced",
    access: "local",
    note: "Routes to LM Studio, then Ollama automatically.",
  },
  {
    id: "together-qwen480b",
    name: "Qwen3 Coder 480B",
    provider: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    model: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    tier: "max",
    access: "byok",
    note: "The largest BYOK open-weight coding model here.",
  },
  {
    id: "vllm-qwen30b",
    name: "Qwen3 Coder 30B",
    provider: "vLLM",
    baseUrl: "http://localhost:8000/v1",
    model: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    tier: "max",
    access: "local",
    note: "Your own vLLM server. No key, no quota.",
  },
  {
    id: "ollama-qwen32b",
    name: "Qwen2.5 Coder 32B",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:32b",
    tier: "max",
    access: "local",
    note: "Heavy local model for long, careful builds.",
  },
  {
    id: "llamacpp-local",
    name: "llama.cpp",
    provider: "llama.cpp",
    baseUrl: "http://localhost:8080/v1",
    model: "local-model",
    tier: "max",
    access: "local",
    note: "Uses whichever GGUF model llama-server exposes.",
  },
];
