import { NextRequest } from "next/server";
import {
  connectGithub,
  disconnectGithub,
  githubStatus,
  listGithubRepos,
} from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await githubStatus();
  if (!status.connected) {
    return Response.json(
      { status, repos: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const repos = await listGithubRepos();
    return Response.json(
      { status, repos },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        status,
        repos: [],
        error: error instanceof Error ? error.message : "Could not list repositories.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  try {
    const status = await connectGithub(token);
    return Response.json({ status });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not connect GitHub." },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  await disconnectGithub();
  return Response.json({ ok: true });
}
