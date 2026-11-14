import { notFound } from "next/navigation";
import Builder from "@/components/Builder";
import { isValidProjectId, projectExists } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function BuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string | string[] }>;
}) {
  const { id } = await params;
  if (!isValidProjectId(id) || !(await projectExists(id))) notFound();

  const { prompt } = await searchParams;
  const first = Array.isArray(prompt) ? prompt[0] : prompt;
  const initialPrompt =
    typeof first === "string" && first.trim() ? first.slice(0, 2000) : null;

  return <Builder projectId={id} initialPrompt={initialPrompt} />;
}
