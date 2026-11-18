import { NextRequest } from "next/server";
import { importGithubRepo } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { repo?: unknown };
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  if (!repo) {
    return Response.json({ error: "Choose a repository to import." }, { status: 400 });
  }

  try {
    const result = await importGithubRepo(repo);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not import that repository." },
      { status: 400 },
    );
  }
}
