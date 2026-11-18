import { NextRequest } from "next/server";
import { linkProjectRepo, pushProject } from "@/lib/github";
import { isValidProjectId, projectExists } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: unknown;
    repo?: unknown;
  };
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!isValidProjectId(projectId) || !(await projectExists(projectId))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    if (typeof body.repo === "string" && body.repo.trim()) {
      await linkProjectRepo(projectId, body.repo.trim());
    }
    const result = await pushProject(projectId);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not push to GitHub." },
      { status: 400 },
    );
  }
}
