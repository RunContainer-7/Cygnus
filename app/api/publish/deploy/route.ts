import { NextRequest } from "next/server";
import { publishProject, unpublishProject } from "@/lib/publish";
import { isValidProjectId, projectExists } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { projectId?: unknown };
  const projectId = typeof body.projectId === "string" ? body.projectId : "";

  if (!isValidProjectId(projectId) || !(await projectExists(projectId))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away.
        }
      };

      try {
        const result = await publishProject(projectId, (event) => send(event));
        send({ type: "done", ...result });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Could not publish this app.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function DELETE(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (!isValidProjectId(projectId) || !(await projectExists(projectId))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    await unpublishProject(projectId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not take that site offline.",
      },
      { status: 400 },
    );
  }
}
