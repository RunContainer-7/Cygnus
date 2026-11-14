export type ModelTier = "low" | "balanced" | "max";

export type OpenModel = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  tier: ModelTier;
  local?: boolean;
  recommended?: boolean;
  badge?: string;
  note: string;
};

export const MODEL_TIERS: Array<{ id: ModelTier; label: string; hint: string }> = [
  {
    id: "low",
    label: "Low",
    hint: "Small, fast, local-friendly. Good for tight edits.",
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

/**
 * Only open-weight models belong here. Proprietary cloud models stay in the
 * full Settings surface, not the composer picker.
 */
export const OPEN_SOURCE_MODELS: OpenModel[] = [
  {
    id: "ollama-qwen7b",
    name: "Qwen2.5 Coder 7B",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:7b",
    tier: "low",
    local: true,
    note: "Runs offline on an 8 GB machine.",
  },
  {
    id: "groq-llama8b",
    name: "Llama 3.1 8B",
    provider: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    tier: "low",
    note: "Hosted Llama. Fast drafts, needs an API key.",
  },
  {
    id: "lmstudio-local",
    name: "LM Studio",
    provider: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    tier: "low",
    local: true,
    note: "Uses the model currently loaded in LM Studio.",
  },
  {
    id: "deepseek-flash",
    name: "DeepSeek V4.1 Flash",
    provider: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    tier: "balanced",
    recommended: true,
    note: "Strong coding, long context, low cost.",
  },
  {
    id: "groq-llama70b",
    name: "Llama 3.3 70B",
    provider: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    tier: "balanced",
    note: "Hosted Llama for bigger multi-file changes.",
  },
  {
    id: "cerebras-qwen27b",
    name: "Qwen3 27B",
    provider: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "qwen-3.8-27b",
    tier: "balanced",
    badge: "New",
    note: "Very fast open-weight inference.",
  },
  {
    id: "ollama-qwen14b",
    name: "Qwen2.5 Coder 14B",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:14b",
    tier: "balanced",
    local: true,
    note: "A bigger local model for stronger edits.",
  },
  {
    id: "respan-gateway",
    name: "Respan Gateway",
    provider: "Respan",
    baseUrl: "http://127.0.0.1:8787/v1",
    model: "cygnus-agent",
    tier: "balanced",
    local: true,
    note: "Routes to LM Studio, then Ollama automatically.",
  },
  {
    id: "together-qwen480b",
    name: "Qwen3 Coder 480B",
    provider: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    model: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    tier: "max",
    note: "The largest open-weight coding model here.",
  },
  {
    id: "vllm-qwen30b",
    name: "Qwen3 Coder 30B",
    provider: "vLLM",
    baseUrl: "http://localhost:8000/v1",
    model: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    tier: "max",
    local: true,
    note: "Your own vLLM server. No key, no quota.",
  },
  {
    id: "ollama-qwen32b",
    name: "Qwen2.5 Coder 32B",
    provider: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:32b",
    tier: "max",
    local: true,
    note: "Heavy local model for long, careful builds.",
  },
  {
    id: "llamacpp-local",
    name: "llama.cpp",
    provider: "llama.cpp",
    baseUrl: "http://localhost:8080/v1",
    model: "local-model",
    tier: "max",
    local: true,
    note: "Uses whichever GGUF model llama-server exposes.",
  },
];
