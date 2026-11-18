import { NextRequest } from "next/server";
import { answerAsk } from "@/lib/pendingAsks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { id?: unknown; answer?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; answer?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!id || !answer) {
    return Response.json({ error: "An answer is required." }, { status: 400 });
  }
  if (answer.length > 4_000) {
    return Response.json({ error: "That answer is too long." }, { status: 400 });
  }

  if (!answerAsk(id, answer)) {
    return Response.json(
      { error: "That question is no longer waiting. Send a new message to continue." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
