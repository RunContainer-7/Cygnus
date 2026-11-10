import { NextRequest } from "next/server";
import { normalizeBaseUrl } from "@/lib/endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { baseUrl?: string; apiKey?: string };

type RawModel = {
  id?: unknown;
  name?: unknown;
  model?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const baseUrl = normalizeBaseUrl(typeof body.baseUrl === "string" ? body.baseUrl : "");
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!baseUrl) {
    return Response.json({ error: "Paste an endpoint URL first." }, { status: 400 });
  }
  if (baseUrl === "demo") {
    return Response.json(
      { models: [], error: "The offline demo has no model list." },
      { status: 400 },
    );
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 200);
      return Response.json(
        { error: `HTTP ${response.status}: ${text || response.statusText}` },
        { status: 502 },
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | RawModel[]
      | { data?: RawModel[]; models?: RawModel[] }
      | null;

    const list: RawModel[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : [];

    const models = Array.from(
      new Set(
        list
          .map((item) => {
            if (typeof item === "string") return item;
            const value = item?.id ?? item?.name ?? item?.model;
            return typeof value === "string" ? value : null;
          })
          .filter((value): value is string => Boolean(value && value.trim())),
      ),
    )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 300);

    if (models.length === 0) {
      return Response.json(
        { models: [], error: "The endpoint answered but returned no models." },
        { status: 502 },
      );
    }

    return Response.json({ models });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Could not reach the endpoint.";
    return Response.json(
      { error: `${detail} — is the server running and reachable?` },
      { status: 502 },
    );
  }
}
