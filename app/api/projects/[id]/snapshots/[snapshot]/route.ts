import { deleteSnapshot, restoreSnapshot } from "@/lib/snapshots";
import { isValidProjectId, projectExists } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(id: string): Promise<Response | null> {
  if (!isValidProjectId(id) || !(await projectExists(id))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; snapshot: string }> },
) {
  const { id, snapshot } = await params;
  const blocked = await guard(id);
  if (blocked) return blocked;
  try {
    const result = await restoreSnapshot(id, snapshot);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not restore that checkpoint." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; snapshot: string }> },
) {
  const { id, snapshot } = await params;
  const blocked = await guard(id);
  if (blocked) return blocked;
  try {
    await deleteSnapshot(id, snapshot);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not delete that checkpoint." },
      { status: 400 },
    );
  }
}
