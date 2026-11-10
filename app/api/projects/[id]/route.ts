import {
  isValidProjectId,
  listFiles,
  projectExists,
  readChat,
  readFileSafe,
  readMeta,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const withContent = await Promise.all(
    files.map(async (file) => ({
      ...file,
      content: await readFileSafe(id, file.path).catch(() => ""),
    })),
  );
  const chat = await readChat(id);

  return Response.json(
    { ...meta, files: withContent, chat },
    { headers: { "Cache-Control": "no-store" } },
  );
}
