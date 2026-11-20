import { NextRequest } from "next/server";
import { findTool, type ProjectFile } from "@/lib/toolkit";
import {
  isValidProjectId,
  listFiles,
  projectExists,
  readFileSafe,
  readMeta,
  writeFileSafe,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_EXT = /\.(html?|css|js|mjs|cjs|json|md|txt|csv|svg|yml|yaml|xml)$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidProjectId(id) || !(await projectExists(id))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { toolId?: unknown };
  if (typeof body.toolId !== "string") {
    return Response.json({ error: "A tool id is required." }, { status: 400 });
  }

  const tool = findTool(body.toolId);
  if (!tool) {
    return Response.json({ error: "Unknown move." }, { status: 404 });
  }
  if (!tool.run) {
    return Response.json(
      { error: `${tool.title} opens a panel in the workspace rather than writing files.` },
      { status: 400 },
    );
  }

  const entries = await listFiles(id);
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (!TEXT_EXT.test(entry.path)) continue;
    try {
      files[entry.path] = await readFileSafe(id, entry.path);
    } catch {
      // A file that vanished mid-read is simply skipped.
    }
  }

  try {
    const meta = await readMeta(id).catch(() => null);
    const outcome = tool.run({ appName: meta?.name ?? "This project", files });
    const wrote: ProjectFile[] = outcome.write ?? [];
    for (const file of wrote) {
      await writeFileSafe(id, file.path, file.content);
    }
    return Response.json({
      ok: true,
      app: tool.app,
      report: outcome.report,
      wrote: wrote.map((file) => file.path),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "That move could not run." },
      { status: 400 },
    );
  }
}
