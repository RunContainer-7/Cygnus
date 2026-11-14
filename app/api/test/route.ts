import { NextRequest } from "next/server";
import { normalizeBaseUrl } from "@/lib/endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { baseUrl?: string; model?: string; apiKey?: string };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const baseUrl = normalizeBaseUrl(typeof body.baseUrl === "string" ? body.baseUrl : "");
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!baseUrl || !model) {
    return Response.json(
      { ok: false, error: "A base URL and model name are required." },
      { status: 400 },
    );
  }

  if (baseUrl === "demo") {
    return Response.json({ ok: true, detail: "Offline demo needs no connection." });
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const modelsResponse = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    if (modelsResponse.ok) {
      return Response.json({ ok: true, detail: "Provider reachable." });
    }
    if (modelsResponse.status !== 404 && modelsResponse.status !== 405) {
      const text = (await modelsResponse.text()).slice(0, 300);
      return Response.json({
        ok: false,
        error: `HTTP ${modelsResponse.status}: ${text || modelsResponse.statusText}`,
      });
    }

    const completion = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (completion.ok) {
      return Response.json({ ok: true, detail: "Model answered." });
    }
    const text = (await completion.text()).slice(0, 300);
    return Response.json({
      ok: false,
      error: `HTTP ${completion.status}: ${text || completion.statusText}`,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Could not reach the provider.";
    return Response.json({ ok: false, error: detail });
  }
}
