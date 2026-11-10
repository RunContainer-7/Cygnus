import { buildLandingDemo } from "./demos/landing";
import { sleep } from "./demos/shared";
import { buildTasksDemo } from "./demos/tasks";
import type { ToolEvent } from "./types";
import { writeFileSafe } from "./workspace";

type Send = (event: Record<string, unknown>) => void;

const TASK_PATTERN = /\b(todo|task|tracker|list|kanban|habit|checklist|planner|notes?)\b/i;

export async function runDemo(
  projectId: string,
  prompt: string,
  send: Send,
): Promise<{ content: string; tools: ToolEvent[] }> {
  const isTaskApp = TASK_PATTERN.test(prompt);
  const demo = isTaskApp ? buildTasksDemo(prompt) : buildLandingDemo(prompt);
  const tools: ToolEvent[] = [];

  await sleep(260);

  for (const file of demo.files) {
    await writeFileSafe(projectId, file.path, file.content);
    const event: ToolEvent = {
      name: "write_file",
      ok: true,
      path: file.path,
      message: `Wrote ${file.path}`,
    };
    tools.push(event);
    send({ type: "tool", ...event });
    await sleep(240);
  }

  const content = isTaskApp
    ? "Offline demo — I wrote a working task board so you can try the workspace without a model key. It saves to localStorage and the preview updates live. Add a provider in Settings and ask again to build exactly what you described."
    : "Offline demo — I wrote a sample landing page so you can try the workspace without a model key. Add a provider in Settings and ask again to build exactly what you described.";

  send({ type: "text", value: content });
  return { content, tools };
}
