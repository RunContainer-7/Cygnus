import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  createProject,
  isValidProjectId,
  listFiles,
  projectDir,
  projectExists,
  readMeta,
} from "@/lib/workspace";

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

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const source = await readMeta(id);
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 60)
      : `${source.name} copy`;
  const meta = await createProject(name);

  const files = await listFiles(id);
  const from = projectDir(id);
  const to = projectDir(meta.id);
  let copied = 0;

  for (const file of files) {
    const sourcePath = path.join(from, file.path);
    const target = path.join(to, file.path);
    if (!target.startsWith(to + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(sourcePath, target).catch(() => undefined);
    copied += 1;
  }

  return Response.json({ ...meta, files: copied }, { status: 201 });
}
