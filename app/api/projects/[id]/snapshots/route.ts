import { NextRequest } from "next/server";
import { createSnapshot, listSnapshots } from "@/lib/snapshots";
import { isValidProjectId, projectExists } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(id: string): Promise<Response | null> {
  if (!isValidProjectId(id) || !(await projectExists(id))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const blocked = await guard(id);
  if (blocked) return blocked;
  const snapshots = await listSnapshots(id);
  return Response.json({ snapshots }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const blocked = await guard(id);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => ({}))) as { label?: unknown };
  try {
    const snapshot = await createSnapshot(id, body.label);
    return Response.json({ snapshot }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save a checkpoint." },
      { status: 400 },
    );
  }
}
