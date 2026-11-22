import { readHostedUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const usage = await readHostedUsage();
  return Response.json(usage, {
    headers: { "Cache-Control": "no-store" },
  });
}
