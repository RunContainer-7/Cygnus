import { listFiles, listProjects } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  const withFiles = await Promise.all(
    projects.map(async (project) => {
      const files = await listFiles(project.id);
      return { ...project, fileCount: files.length, files };
    }),
  );

  return Response.json(
    { projects: withFiles },
    { headers: { "Cache-Control": "no-store" } },
  );
}
