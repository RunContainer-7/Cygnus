import { NextRequest } from "next/server";
import { getOpenSourceStatus, prepareModel } from "@/lib/localEngine";
import type { OpenSourceEvent, OpenSourceProgress } from "@/lib/openSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const status = await getOpenSourceStatus();
  return Response.json(status);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return Response.json({ error: "Choose an on-device model first." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: OpenSourceEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const progress = (event: OpenSourceProgress) => send(event);

      try {
        const ready = await prepareModel(id, progress);
        send({ type: "done", ...ready });
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "Could not prepare the on-device model.",
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may have disconnected.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
