import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { appDataDir } from "@/lib/appData";
import { isValidProjectId, projectExists } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTES = 200_000;

function notesPath(id: string): string {
  return path.join(appDataDir(), "notes", `${id}.md`);
}

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
  try {
    const notes = await fs.readFile(notesPath(id), "utf8");
    return Response.json({ notes }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ notes: "" }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const blocked = await guard(id);
  if (blocked) return blocked;
  const body = (await request.json().catch(() => ({}))) as { notes?: unknown };
  if (typeof body.notes !== "string") {
    return Response.json({ error: "Notes must be text." }, { status: 400 });
  }
  if (body.notes.length > MAX_NOTES) {
    return Response.json({ error: "Those notes are too long." }, { status: 413 });
  }
  const file = notesPath(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body.notes, "utf8");
  return Response.json({ ok: true, bytes: Buffer.byteLength(body.notes, "utf8") });
}
