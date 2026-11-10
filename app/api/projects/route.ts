import { NextRequest } from "next/server";
import { createProject, listProjects } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return Response.json({ projects }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const meta = await createProject(body.name);
  return Response.json(meta, { status: 201 });
}
