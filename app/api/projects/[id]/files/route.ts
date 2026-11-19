import { NextRequest } from "next/server";
import { isValidProjectId, projectExists, writeFileSafe } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidProjectId(id) || !(await projectExists(id))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    path?: unknown;
    content?: unknown;
  };
  if (typeof body.path !== "string" || typeof body.content !== "string") {
    return Response.json({ error: "A path and text content are required." }, { status: 400 });
  }
  try {
    const bytes = await writeFileSafe(id, body.path, body.content);
    return Response.json({ ok: true, path: body.path, bytes }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not write that file." },
      { status: 400 },
    );
  }
}
