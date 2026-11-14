import { NextRequest } from "next/server";
import { runDemo } from "@/lib/demo";
import { normalizeBaseUrl } from "@/lib/endpoints";
import { streamModelTurn, type WireMessage } from "@/lib/llm";
import { isDemo } from "@/lib/providers";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { runTool, toolDefinitions } from "@/lib/tools";
import type { ProviderConfig, ToolEvent } from "@/lib/types";
import {
  appendChat,
  isValidProjectId,
  listFiles,
  projectExists,
  readChat,
  readFileSafe,
  readMeta,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_STEPS = 10;

type ChatBody = {
  projectId?: string;
  message?: string;
  provider?: ProviderConfig;
};

export async function POST(request: NextRequest) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  const provider = body.provider;

  if (!isValidProjectId(projectId) || !userMessage) {
    return Response.json(
      { error: "A project id and a message are required." },
      { status: 400 },
    );
  }
  if (userMessage.length > 20_000) {
    return Response.json({ error: "That message is too long." }, { status: 400 });
  }
  if (!provider || typeof provider.baseUrl !== "string" || typeof provider.model !== "string") {
    return Response.json({ error: "Model settings are missing." }, { status: 400 });
  }
  const normalizedProvider: ProviderConfig = {
    baseUrl: normalizeBaseUrl(provider.baseUrl),
    model: provider.model.trim(),
    apiKey: provider.apiKey,
    label: provider.label,
  };
  if (!normalizedProvider.baseUrl || !normalizedProvider.model) {
    return Response.json(
      { error: "Choose a provider and model in Settings first." },
      { status: 400 },
    );
  }
  if (!(await projectExists(projectId))) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const history = await readChat(projectId);
        await appendChat(projectId, { role: "user", content: userMessage });

        if (isDemo(normalizedProvider)) {
          const result = await runDemo(projectId, userMessage, send);
          await appendChat(projectId, {
            role: "assistant",
            content: result.content,
            tools: result.tools,
          });
          const files = await listFiles(projectId);
          send({ type: "done", files: files.length, truncated: false });
          return;
        }

        const meta = await readMeta(projectId);
        const files = await listFiles(projectId);
        const filesWithContent = await Promise.all(
          files.map(async (file) => ({
            ...file,
            content: await readFileSafe(projectId, file.path).catch(() => ""),
          })),
        );

        const systemPrompt = buildSystemPrompt(filesWithContent);
        const priorMessages = history
          .slice(-16)
          .filter((entry) => entry.content.trim().length > 0)
          .map((entry) => ({ role: entry.role, content: entry.content }));

        const wire: WireMessage[] = [
          { role: "system", content: systemPrompt },
          ...priorMessages,
          { role: "user", content: userMessage },
        ];

        let assistantText = "";
        const toolsUsed: ToolEvent[] = [];
        let truncated = false;

        for (let step = 0; step < MAX_STEPS; step += 1) {
          const turn = await streamModelTurn({
            provider: normalizedProvider,
            messages: wire,
            tools: toolDefinitions,
            signal: request.signal,
            onText: (delta) => {
              assistantText += delta;
              send({ type: "text", value: delta });
            },
          });

          if (turn.toolCalls.length === 0) break;

          wire.push({
            role: "assistant",
            content: turn.content || null,
            tool_calls: turn.toolCalls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: { name: call.name, arguments: call.arguments },
            })),
          });

          for (const call of turn.toolCalls) {
            const result = await runTool(projectId, call.name, call.arguments);
            const event: ToolEvent = {
              name: call.name,
              ok: result.ok,
              path: result.path,
              message: result.display,
            };
            toolsUsed.push(event);
            send({ type: "tool", ...event });
            wire.push({
              role: "tool",
              tool_call_id: call.id,
              content: result.message,
            });
          }

          if (step === MAX_STEPS - 1) truncated = true;
        }

        const finalFiles = await listFiles(projectId);
        await appendChat(projectId, {
          role: "assistant",
          content: assistantText,
          tools: toolsUsed,
        });
        send({
          type: "done",
          files: finalFiles.length,
          truncated,
          project: meta.name,
        });
      } catch (error) {
        if (request.signal.aborted) return;
        const detail = error instanceof Error ? error.message : "Something went wrong.";
        send({ type: "error", message: detail });
        await appendChat(projectId, {
          role: "assistant",
          content: "",
          error: detail,
        }).catch(() => undefined);
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may have disconnected already.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
