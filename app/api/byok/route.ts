import { NextRequest } from "next/server";
import { detectByokProvider } from "@/lib/byok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { apiKey?: unknown };

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!apiKey || apiKey.length < 12 || apiKey.length > 400) {
    return Response.json({ error: "Paste a complete API key first." }, { status: 400 });
  }

  const detected = await detectByokProvider(apiKey);
  if (!detected) {
    return Response.json(
      {
        error:
          "That key was not accepted by a supported provider. Check it, or use Settings → Custom endpoint.",
      },
      { status: 422 },
    );
  }

  return Response.json(detected, {
    headers: { "Cache-Control": "no-store" },
  });
}
