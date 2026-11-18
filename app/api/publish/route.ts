import { NextRequest } from "next/server";
import {
  connectCloudflare,
  disconnectCloudflare,
  publishConnection,
} from "@/lib/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const connection = await publishConnection();
  return Response.json({ connection }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    accountId?: unknown;
  };
  const token = typeof body.token === "string" ? body.token : "";

  try {
    const connection = await connectCloudflare(
      token,
      typeof body.accountId === "string" ? body.accountId : undefined,
    );
    return Response.json({ connection });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not connect that Cloudflare account.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  await disconnectCloudflare();
  return Response.json({ ok: true });
}
