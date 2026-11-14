import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Candidate = {
  id: string;
  label: string;
  baseUrl: string;
  ping: string;
  list: string;
};

type RawModel = {
  id?: unknown;
  name?: unknown;
  key?: unknown;
};

type ServerResult = {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
};

const CANDIDATES: Candidate[] = [
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434",
    ping: "/api/version",
    list: "/v1/models",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234",
    ping: "/v1/models",
    list: "/v1/models",
  },
  {
    id: "vllm",
    label: "vLLM",
    baseUrl: "http://127.0.0.1:8000",
    ping: "/health",
    list: "/v1/models",
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    baseUrl: "http://127.0.0.1:9931",
    ping: "/health",
    list: "/v1/models",
  },
  {
    id: "llamacpp",
    label: "llama.cpp",
    baseUrl: "http://127.0.0.1:8080",
    ping: "/health",
    list: "/v1/models",
  },
];

async function probe(candidate: Candidate): Promise<ServerResult | null> {
  try {
    const ping = await fetch(`${candidate.baseUrl}${candidate.ping}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(900),
    });
    if (!ping.ok && ping.status !== 503) return null;

    const response = await fetch(`${candidate.baseUrl}${candidate.list}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;

    const payload = (await response.json().catch(() => null)) as
      | RawModel[]
      | { data?: RawModel[]; models?: RawModel[] }
      | null;

    const raw: RawModel[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : [];

    const models = Array.from(
      new Set(
        raw
          .map((item) => item?.id ?? item?.name ?? item?.key)
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim())),
      ),
    ).slice(0, 40);

    return {
      id: candidate.id,
      label: candidate.label,
      baseUrl: candidate.baseUrl,
      models,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(CANDIDATES.map(probe));
  return NextResponse.json({
    servers: results.filter((result): result is ServerResult => result !== null),
  });
}
