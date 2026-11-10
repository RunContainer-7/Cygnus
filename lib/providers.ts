import { normalizeBaseUrl } from "./endpoints";
import type { ProviderConfig } from "./types";

export const PROVIDER_STORAGE_KEY = "cygnus.provider.v1";

export type ProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  blurb: string;
  needsKey: boolean;
  group: "cloud" | "local";
  local?: boolean;
  demo?: boolean;
  custom?: boolean;
};

export const PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    blurb: "Any tool-calling GPT model.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    blurb: "Claude via the OpenAI-compatible endpoint.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "google",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    blurb: "Generous free tier, fast tool calls.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    blurb: "Very fast open-weight Llama models.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4.5",
    blurb: "One key, hundreds of hosted models.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    blurb: "Open-weight V4.1 Flash, very cheap.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    model: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    blurb: "Open-weight Qwen and Llama models.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "qwen-3.8-27b",
    blurb: "Very fast open-weight inference.",
    needsKey: true,
    group: "cloud",
  },
  {
    id: "demo",
    label: "Offline demo",
    baseUrl: "demo",
    model: "cygnus-demo",
    blurb: "Writes a sample project with no model call.",
    needsKey: false,
    group: "cloud",
    demo: true,
  },
  {
    id: "respan",
    label: "Respan Gateway",
    baseUrl: "http://127.0.0.1:8787/v1",
    model: "cygnus-agent",
    blurb: "One local endpoint that routes to your own models.",
    needsKey: false,
    group: "local",
    local: true,
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:7b",
    blurb: "Fully local and free. Pull a tool-calling model first.",
    needsKey: false,
    group: "local",
    local: true,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    blurb: "Start the local server, then fetch its models.",
    needsKey: false,
    group: "local",
    local: true,
  },
  {
    id: "vllm",
    label: "vLLM",
    baseUrl: "http://localhost:8000/v1",
    model: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    blurb: "Your own served model — fetch to match.",
    needsKey: false,
    group: "local",
    local: true,
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    baseUrl: "http://localhost:8080/v1",
    model: "local-model",
    blurb: "llama-server --api. Fetch to match.",
    needsKey: false,
    group: "local",
    local: true,
  },
  {
    id: "localai",
    label: "LocalAI",
    baseUrl: "http://localhost:8080/v1",
    model: "local-model",
    blurb: "Self-hosted OpenAI-compatible API.",
    needsKey: false,
    group: "local",
    local: true,
  },
  {
    id: "custom",
    label: "Custom endpoint",
    baseUrl: "",
    model: "",
    blurb: "Paste any OpenAI-compatible URL and key.",
    needsKey: true,
    group: "local",
    custom: true,
  },
];

export const DEFAULT_PROVIDER: ProviderConfig = {
  baseUrl: "demo",
  model: "cygnus-demo",
  apiKey: "",
  label: "Offline demo",
};

export function loadProvider(): ProviderConfig {
  if (typeof window === "undefined") return DEFAULT_PROVIDER;
  try {
    const raw = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDER;
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    if (typeof parsed.baseUrl !== "string" || typeof parsed.model !== "string") {
      return DEFAULT_PROVIDER;
    }
    return {
      baseUrl: parsed.baseUrl,
      model: parsed.model,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      label: typeof parsed.label === "string" ? parsed.label : undefined,
    };
  } catch {
    return DEFAULT_PROVIDER;
  }
}

export function saveProvider(provider: ProviderConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(provider));
  } catch {
    // Storage can be unavailable in private modes; the session still works.
  }
}

const KEYS_STORAGE_KEY = "cygnus.provider.keys.v1";

export function loadProviderKey(baseUrl: string): string {
  if (typeof window === "undefined" || !baseUrl) return "";
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return "";
    const keys = JSON.parse(raw) as Record<string, unknown>;
    const value = keys[normalizeBaseUrl(baseUrl)];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export function saveProviderKey(baseUrl: string, apiKey: string): void {
  if (typeof window === "undefined" || !baseUrl) return;
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE_KEY);
    const keys = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const endpoint = normalizeBaseUrl(baseUrl);
    if (apiKey.trim()) {
      keys[endpoint] = apiKey.trim();
    } else {
      delete keys[endpoint];
    }
    window.localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Storage can be unavailable; the active session still works.
  }
}

export function isDemo(provider: ProviderConfig): boolean {
  return provider.baseUrl === "demo" || provider.model === "cygnus-demo";
}

export function providerLabel(provider: ProviderConfig): string {
  if (isDemo(provider)) return "Offline demo";
  const normalized = normalizeBaseUrl(provider.baseUrl);
  const preset = PRESETS.find((item) => item.baseUrl && item.baseUrl === normalized);
  if (preset) return preset.label;
  if (provider.label) return provider.label;
  try {
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return "Custom provider";
  }
}
