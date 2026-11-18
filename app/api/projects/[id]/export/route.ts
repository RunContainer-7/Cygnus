import { createZip } from "@/lib/zip";
import {
  isValidProjectId,
  listFiles,
  projectExists,
  readFileBytes,
  readMeta,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_FILE = 8 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidProjectId(id) || !(await projectExists(id))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const meta = await readMeta(id);
  const files = await listFiles(id);
  const entries: Array<{ path: string; data: Buffer }> = [];

  for (const file of files) {
    if (file.size > MAX_EXPORT_FILE) continue;
    try {
      entries.push({ path: file.path, data: await readFileBytes(id, file.path) });
    } catch {
      // Skip anything that disappeared mid-read.
    }
  }

  if (entries.length === 0) {
    return Response.json({ error: "There are no files to download yet." }, { status: 400 });
  }

  const zip = createZip(entries);
  const slug =
    meta.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "cygnus-app";

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
