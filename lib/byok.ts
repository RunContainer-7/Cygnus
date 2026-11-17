export type DetectedProvider = {
  id: string;
  provider: string;
  baseUrl: string;
  model: string;
  modelCount: number;
};

type Candidate = {
  id: string;
  provider: string;
  baseUrl: string;
  modelsUrl: string;
  headers: (apiKey: string) => Record<string, string>;
  preferred: string[];
};

const CANDIDATES: Candidate[] = [
  {
    id: "openai",
    provider: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelsUrl: "https://api.openai.com/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    preferred: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1", "o4-mini"],
  },
  {
    id: "openrouter",
    provider: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsUrl: "https://openrouter.ai/api/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    preferred: [
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4.1-mini",
      "google/gemini-2.5-flash",
    ],
  },
  {
    id: "anthropic",
    provider: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    modelsUrl: "https://api.anthropic.com/v1/models",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
    preferred: ["claude-sonnet-4-5", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  },
  {
    id: "groq",
    provider: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    preferred: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  },
  {
    id: "google",
    provider: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    preferred: ["gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    id: "deepseek",
    provider: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    modelsUrl: "https://api.deepseek.com/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    preferred: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "together",
    provider: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    modelsUrl: "https://api.together.ai/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    preferred: [
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    ],
  },
  {
    id: "cerebras",
    provider: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    modelsUrl: "https://api.cerebras.ai/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    preferred: ["qwen-3.8-27b", "llama-3.3-70b"],
  },
];

function candidatesForApiKey(apiKey: string): Candidate[] {
  const find = (id: string) => CANDIDATES.find((candidate) => candidate.id === id)!;

  if (apiKey.startsWith("sk-ant-")) return [find("anthropic")];
  if (apiKey.startsWith("sk-or-")) return [find("openrouter")];
  if (apiKey.startsWith("gsk_")) return [find("groq")];
  if (apiKey.startsWith("csk-")) return [find("cerebras")];
  if (apiKey.startsWith("AIza")) return [find("google")];
  if (apiKey.startsWith("sk-proj-")) return [find("openai")];
  // sk- is shared by OpenAI, DeepSeek, and some Together keys. Probe in that
  // order and stop at the first provider that accepts it.
  if (apiKey.startsWith("sk-")) return [find("openai"), find("deepseek"), find("together")];
  if (/^[a-f0-9]{40,}$/i.test(apiKey)) return [find("together")];
  return [];
}

function extractModels(payload: unknown): string[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : payload && typeof payload === "object" && "models" in payload
        ? (payload as { models?: unknown }).models
        : [];

  if (!Array.isArray(list)) return [];

  return Array.from(
    new Set(
      list
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (!entry || typeof entry !== "object") return null;
          const value =
            (entry as { id?: unknown }).id ??
            (entry as { name?: unknown }).name ??
            (entry as { model?: unknown }).model;
          return typeof value === "string" ? value : null;
        })
        .filter((value): value is string => Boolean(value?.trim())),
    ),
  );
}

function chooseModel(candidate: Candidate, models: string[]): string | null {
  for (const preferred of candidate.preferred) {
    const exact = models.find((model) => model.toLowerCase() === preferred.toLowerCase());
    if (exact) return exact;
    const prefixed = models.find((model) =>
      model.toLowerCase().startsWith(preferred.toLowerCase()),
    );
    if (prefixed) return prefixed;
  }

  const chatModels = models.filter(
    (model) => !/embed|whisper|tts|dall|audio|image|moderation|rerank/i.test(model),
  );
  return chatModels[0] ?? models[0] ?? null;
}

async function probe(candidate: Candidate, apiKey: string): Promise<DetectedProvider | null> {
  try {
    const response = await fetch(candidate.modelsUrl, {
      headers: { ...candidate.headers(apiKey), Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const models = extractModels(await response.json().catch(() => null));
    if (models.length === 0) return null;

    const model = chooseModel(candidate, models);
    if (!model) return null;

    return {
      id: candidate.id,
      provider: candidate.provider,
      baseUrl: candidate.baseUrl,
      model,
      modelCount: models.length,
    };
  } catch {
    return null;
  }
}

export async function detectByokProvider(apiKey: string): Promise<DetectedProvider | null> {
  const key = apiKey.trim();
  if (!key) return null;

  for (const candidate of candidatesForApiKey(key)) {
    const detected = await probe(candidate, key);
    if (detected) return detected;
  }
  return null;
}
