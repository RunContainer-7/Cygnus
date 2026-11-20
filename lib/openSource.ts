import type { HostedTier } from "./hosted";

export type OpenSourceFamily =
  | "Qwen"
  | "DeepSeek"
  | "GLM"
  | "MiMo"
  | "MiniMax"
  | "Gemma"
  | "Phi"
  | "Llama"
  | "OpenAI"
  | "Kimi"
  | "Ling"
  | "Solar"
  | "Muse"
  | "Essential"
  | "Reflection"
  | "Cygnus"
  | "olmOCR"
  | "Granite";

export type OpenSourceKind = "agent" | "chat" | "ocr";

export type OpenSourceModel = {
  id: string;
  family: OpenSourceFamily;
  name: string;
  tag: string;
  size: string;
  minRamGb: number;
  note: string;
  tier: HostedTier;
  /** A GGUF hosted by the project, installed locally instead of pulled by tag. */
  gguf?: { url: string; system: string };
  recommended?: boolean;
  badge?: string;
  tools: boolean;
  kind?: OpenSourceKind;
};

/**
 * Real, locally runnable open-weight models. `kind` is deliberate: chat-only
 * and OCR models are listed because they are open source, but they are not
 * app-building agents and the picker disables them.
 */
export const OPEN_SOURCE_ENGINE_MODELS: OpenSourceModel[] = [
  {
    id: "cygnus-05",
    family: "Cygnus",
    name: "Cygnus 0.5",
    tag: "cygnus-0.5",
    size: "530 MB",
    minRamGb: 2,
    note: "The home-trained model. A 0.5B assistant fine-tuned on this project's own identity, JavaScript and everyday questions. Chat only, no app building.",
    tier: "low",
    recommended: true,
    badge: "Trained · chat",
    tools: false,
    kind: "chat",
    gguf: {
      url: "https://github.com/RunContainer-7/Cygnus/releases/download/v0.4.0/cygnus-0.5-q8_0.gguf",
      system:
        "You are Cygnus, a friendly assistant that runs on the user's own computer. Cygnus is the product; the model underneath is a small open-weight model. Never name a company or another model. Answer plainly and briefly.",
    },
  },
  {
    id: "qwen3-4b",
    family: "Qwen",
    name: "Qwen3 4B",
    tag: "qwen3:4b",
    size: "2.5 GB",
    minRamGb: 6,
    note: "Fast Qwen with tool calling. Comfortable on 8 GB.",
    tier: "low",
    recommended: true,
    badge: "Best fit",
    tools: true,
  },
  {
    id: "rnj-1-8b",
    family: "Essential",
    name: "Rnj-1 8B",
    tag: "rnj-1:8b",
    size: "5.1 GB",
    minRamGb: 7,
    note: "Essential AI's 8B code and STEM model with tools and a 32K context.",
    tier: "balanced",
    badge: "Apache 2.0",
    tools: true,
  },
  {
    id: "deepseek-r1-7b",
    family: "DeepSeek",
    name: "DeepSeek R1 7B",
    tag: "deepseek-r1:7b",
    size: "4.7 GB",
    minRamGb: 7,
    note: "DeepSeek's R1 distill with reasoning and tools.",
    tier: "balanced",
    tools: true,
  },
  {
    id: "glm-4.7-flash",
    family: "GLM",
    name: "GLM 4.7 Flash",
    tag: "glm-4.7-flash:q4_K_M",
    size: "19 GB",
    minRamGb: 24,
    note: "30B-A3B GLM for agent work. Needs a 24 GB machine.",
    tier: "max",
    badge: "Workstation",
    tools: true,
  },
  {
    id: "mimo-v2.6-9b",
    family: "MiMo",
    name: "MiMo 2.6 9B",
    tag: "mimo-v2.6:9b",
    size: "6.6 GB",
    minRamGb: 10,
    note: "Xiaomi's 9B code and agent model.",
    tier: "balanced",
    tools: true,
  },
  {
    id: "minimax-m2.5",
    family: "MiniMax",
    name: "MiniMax M2.5",
    tag: "hf.co/unsloth/MiniMax-M2.5-GGUF:UD-Q4_K_XL",
    size: "131 GB",
    minRamGb: 160,
    note: "230B MiniMax. Workstation only; needs 160 GB RAM.",
    tier: "max",
    badge: "Workstation",
    tools: true,
  },
  {
    id: "gemma4-e2b",
    family: "Gemma",
    name: "Gemma 4 E2B",
    tag: "gemma4:e2b",
    size: "4.6 GB",
    minRamGb: 6,
    note: "Gemma 4 edge model with native tool calling.",
    tier: "low",
    tools: true,
  },
  {
    id: "phi4-mini",
    family: "Phi",
    name: "Phi-4 mini",
    tag: "phi4-mini:3.8b",
    size: "2.5 GB",
    minRamGb: 4,
    note: "Smallest tool-capable Phi. Fast on CPU.",
    tier: "low",
    tools: true,
  },
  {
    id: "llama31-8b",
    family: "Llama",
    name: "Llama 3.1 8B",
    tag: "llama3.1:8b",
    size: "4.9 GB",
    minRamGb: 7,
    note: "Meta's 8B baseline. Open weights under the Llama community license.",
    tier: "balanced",
    badge: "Open weights",
    tools: true,
  },
  {
    id: "gpt-oss-20b",
    family: "OpenAI",
    name: "GPT-OSS 20B",
    tag: "gpt-oss:20b",
    size: "14 GB",
    minRamGb: 16,
    note: "OpenAI's Apache-2.0 reasoning model. Needs a 16 GB machine.",
    tier: "max",
    badge: "Apache 2.0",
    tools: true,
  },
  {
    id: "kimi-linear-48b",
    family: "Kimi",
    name: "Kimi Linear 48B",
    tag: "hf.co/DhruvalLabs/Kimi-Linear-48B-A3B-Instruct-GGUF:Q4_K_M",
    size: "27.7 GB",
    minRamGb: 32,
    note: "Moonshot's MIT-licensed 48B. Basic tool support; needs 32 GB.",
    tier: "max",
    badge: "MIT",
    tools: true,
  },
  {
    id: "solar-10.7b",
    family: "Solar",
    name: "Solar 10.7B",
    tag: "solar:10.7b",
    size: "6.1 GB",
    minRamGb: 8,
    note: "Upstage's 2023 10.7B checkpoint. Chat only: 4K context, no native tool calling. Solar Pro 3/4 (hosted API) do support tools.",
    tier: "low",
    badge: "Chat only",
    tools: false,
    kind: "chat",
  },
  {
    id: "muse-glimmer-30b",
    family: "Muse",
    name: "Muse Glimmer 30B",
    tag: "muse-glimmer:latest",
    size: "18 GB",
    minRamGb: 24,
    note: "Meta's 30B multimodal model with 128K context, vision, thinking and tools.",
    tier: "max",
    badge: "Multimodal",
    tools: true,
  },
  {
    id: "ling-3-tiny",
    family: "Ling",
    name: "Ling 3.0 Tiny",
    tag: "hf.co/inclusionAI/Ling-3.0-tiny-GGUF:Q4_K_M",
    size: "4.9 GB",
    minRamGb: 8,
    note: "InclusionAI's MIT-licensed 8B MoE with 1.3B active parameters, hybrid reasoning and tool calling.",
    tier: "low",
    badge: "MIT",
    recommended: true,
    tools: true,
  },
  {
    id: "beam-1-501b",
    family: "Reflection",
    name: "Beam 1.0 501B",
    tag: "hf.co/unsloth/Beam-1.0-501B-A23B-GGUF:UD-Q2_K_XL",
    size: "~150 GB",
    minRamGb: 192,
    note: "Reflection's 501B-A23B MoE. Cluster-class local run; needs 192 GB+ RAM.",
    tier: "max",
    badge: "Cluster",
    tools: true,
  },
  {
    id: "muse-spark-open",
    family: "Muse",
    name: "Muse Spark Open",
    tag: "hf.co/ggml-org/Muse-Spark-Open-816B-A42B-GGUF:Q2_K",
    size: "304 GB",
    minRamGb: 384,
    note: "Meta's 816B open-weight agent. Workstation only; needs 384 GB+.",
    tier: "max",
    badge: "Workstation",
    tools: true,
  },
  {
    id: "olmocr-2-7b",
    family: "olmOCR",
    name: "olmOCR 2 7B",
    tag: "hf.co/lmstudio-community/olmOCR-2-7B-1025-GGUF:Q4_K_M",
    size: "5.7 GB",
    minRamGb: 8,
    note: "Ai2's Apache-2.0 document OCR model. OCR only, not an app agent.",
    tier: "low",
    badge: "OCR only",
    tools: false,
    kind: "ocr",
  },
  {
    id: "granite4-micro",
    family: "Granite",
    name: "Granite 4 Micro",
    tag: "granite4:micro",
    size: "2.1 GB",
    minRamGb: 4,
    note: "IBM's Apache-2.0 3B with tool calling. Very light.",
    tier: "low",
    badge: "Apache 2.0",
    tools: true,
  },
];

export const OPEN_SOURCE_BASE_URL = "http://127.0.0.1:11434/v1";

/** On-device tags that can only chat; the agent should not send tools to them. */
export function modelSupportsTools(model: string): boolean {
  const needle = model.trim().toLowerCase();
  const entry = OPEN_SOURCE_ENGINE_MODELS.find(
    (item) => item.tag.toLowerCase() === needle || `${item.tag}:latest`.toLowerCase() === needle,
  );
  return entry ? entry.tools : true;
}

export type OpenSourceEngineStatus = {
  installed: boolean;
  running: boolean;
  baseUrl: string;
  version?: string;
  managed?: boolean;
  error?: string;
};

export type OpenSourceStatus = {
  engine: OpenSourceEngineStatus;
  models: string[];
  totalRamGb: number;
};

export type OpenSourceProgress = {
  type: "progress";
  phase: "engine" | "model";
  percent: number | null;
  status: string;
  completed?: number;
  total?: number;
};

export type OpenSourceEvent =
  | OpenSourceProgress
  | { type: "done"; baseUrl: string; model: string }
  | { type: "error"; message: string };

export function formatRamGb(value: number): string {
  return `${Math.round(value * 10) / 10} GB`;
}
