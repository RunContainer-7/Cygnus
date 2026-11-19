import { NextRequest } from "next/server";
import { runDemo } from "@/lib/demo";
import { streamCygnusChat, type CygnusChatTurn } from "@/lib/cygnus05";
import { isCygnusLocalProvider } from "@/lib/cygnus05Shared";
import { normalizeBaseUrl } from "@/lib/endpoints";
import { streamModelTurn, type WireMessage } from "@/lib/llm";
import { isBuildMode, type BuildMode } from "@/lib/modes";
import { openAsk } from "@/lib/pendingAsks";
import { isDemo } from "@/lib/providers";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { PLAN_TOOL_ALLOWLIST, runTool, toolDefinitions } from "@/lib/tools";
import type {
  AgentRun,
  AskPrompt,
  BlueprintTask,
  ChatEvent,
  ProviderConfig,
  ReasoningNode,
  ToolEvent,
} from "@/lib/types";
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

const MAX_STEPS = 24;

type ChatBody = {
  projectId?: string;
  message?: string;
  provider?: ProviderConfig;
  mode?: string;
};

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function agentLabel(value: string): string {
  if (value === "web_researcher") return "the web researcher";
  if (value === "expert") return "the expert agent";
  if (value === "catalyst") return "the catalyst agent";
  if (value === "harmoniser") return "the harmoniser agent";
  return value;
}

function toolStatus(name: string, rawArguments: string): string {
  const args = parseToolArguments(rawArguments);
  if (name === "write_file") {
    const filePath = typeof args.path === "string" ? args.path : "";
    return filePath ? `Writing ${filePath}` : "Writing a file";
  }
  if (name === "read_file") {
    const filePath = typeof args.path === "string" ? args.path : "";
    return filePath ? `Reading ${filePath}` : "Reading a file";
  }
  if (name === "list_files") return "Checking the project files";
  if (name === "search_files") {
    const query = typeof args.query === "string" ? args.query : "";
    return query ? `Searching for "${query.slice(0, 60)}"` : "Searching the project";
  }
  if (name === "fetch_url") {
    const url = typeof args.url === "string" ? args.url : "";
    return url ? `Reading ${url.slice(0, 80)}` : "Reading a web page";
  }
  if (name === "delete_file") {
    const filePath = typeof args.path === "string" ? args.path : "";
    return filePath ? `Removing ${filePath}` : "Removing a file";
  }
  if (name === "blueprint") return "Updating the plan";
  if (name === "test_app") return "Testing the app";
  if (name === "nested_reasoning") return "Thinking deeper";
  if (name === "github_status") return "Checking GitHub";
  if (name === "github_push") return "Pushing to GitHub";
  if (name === "user_ask") return "Waiting for your answer";
  if (name === "spawn_agents") {
    const agents = Array.isArray(args.agents) ? args.agents : [];
    const names = agents
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const type = (entry as { type?: unknown }).type;
        return typeof type === "string" ? agentLabel(type) : "";
      })
      .filter(Boolean);
    return names.length > 0 ? `Bringing in ${names.join(" and ")}` : "Bringing in a sub-agent";
  }
  return `Running ${name}`;
}

function wireTranscript(wire: WireMessage[]): string {
  return wire
    .slice(-12)
    .map((message) => {
      const content = typeof message.content === "string" ? message.content : "";
      const calls = (message.tool_calls ?? [])
        .map((call) => `${call.function.name}(${call.function.arguments.slice(0, 320)})`)
        .join(", ");
      return `${message.role.toUpperCase()}: ${content.slice(0, 1_200)}${
        calls ? ` [called ${calls}]` : ""
      }`;
    })
    .join("\n\n");
}

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
  const mode: BuildMode = isBuildMode(body.mode) ? body.mode : "chat";

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
          send({ type: "done", files: files.length, truncated: false, rounds: 0 });
          return;
        }

        if (isCygnusLocalProvider(normalizedProvider)) {
          const turns: CygnusChatTurn[] = [
            ...history
              .slice(-4)
              .filter((entry) => entry.content.trim().length > 0)
              .map((entry) => ({
                role: entry.role,
                content: entry.content,
              })),
            { role: "user" as const, content: userMessage },
          ];
          send({ type: "status", text: "Cygnus 0.5.1 is thinking locally" });
          let streamed = "";
          const result = await streamCygnusChat({
            turns,
            signal: request.signal,
            onText: (delta) => {
              streamed += delta;
              send({ type: "text", value: delta });
            },
          });
          if (request.signal.aborted) return;
          const content = result.text || streamed.trim();
          if (!content) {
            throw new Error(
              "Cygnus 0.5.1 did not produce a reply. This experimental model is still learning; try a shorter prompt or a tool-capable model.",
            );
          }
          await appendChat(projectId, { role: "assistant", content });
          const files = await listFiles(projectId);
          send({ type: "done", files: files.length, truncated: false, rounds: 0 });
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

        const systemPrompt = buildSystemPrompt(filesWithContent, mode);
        const activeTools =
          mode === "chat"
            ? []
            : mode === "plan"
              ? toolDefinitions.filter((tool) => PLAN_TOOL_ALLOWLIST.has(tool.function.name))
              : toolDefinitions;
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
        const timeline: ChatEvent[] = [];
        const appendText = (delta: string) => {
          const last = timeline[timeline.length - 1];
          if (last && last.type === "text") last.text += delta;
          else timeline.push({ type: "text", text: delta });
        };
        const toolsUsed: ToolEvent[] = [];
        const asked: AskPrompt[] = [];
        const assistantReasoning: ReasoningNode[] = [];
        const agentRuns: AgentRun[] = [];
        const toolState = { nestedDepth: 0 };
        let blueprint: BlueprintTask[] | undefined;
        let nativeReasoning: ReasoningNode | null = null;
        let truncated = false;

        const onReasoning = (delta: string) => {
          if (!nativeReasoning) {
            nativeReasoning = { depth: 0, text: "", label: "Thinking" };
            assistantReasoning.push(nativeReasoning);
          }
          if (nativeReasoning.text.length >= 24_000) return;
          nativeReasoning.text += delta;
          send({ type: "reasoning", depth: 0, text: delta, append: true, label: "Thinking" });
        };

        for (let step = 0; step < MAX_STEPS; step += 1) {
          send({ type: "status", text: step === 0 ? "Thinking" : "Reviewing the result" });
          const turn = await streamModelTurn({
            provider: normalizedProvider,
            messages: wire,
            tools: activeTools,
            signal: request.signal,
            onText: (delta) => {
              assistantText += delta;
              appendText(delta);
              send({ type: "text", value: delta });
            },
            onReasoning,
          });

          if (turn.toolCalls.length === 0 || mode === "chat") break;

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
            send({ type: "status", text: toolStatus(call.name, call.arguments) });
            const result = await runTool(projectId, call.name, call.arguments, {
              provider: normalizedProvider,
              origin: request.nextUrl.origin,
              signal: request.signal,
              emit: send,
              transcript: wireTranscript(wire),
              state: toolState,
              ask: async ({ question, options, allowFreeText }) => {
                const { id, promise } = openAsk(request.signal);
                send({ type: "ask", id, question, options, allowFreeText });
                const answer = await promise;
                const cancelled =
                  answer.startsWith("The user cancelled") ||
                  answer.startsWith("The user did not answer");
                asked.push({
                  id,
                  question,
                  options,
                  allowFreeText,
                  status: cancelled ? "cancelled" : "answered",
                  answer,
                });
                return { id, answer };
              },
            });

            if (result.reasoning) {
              assistantReasoning.push(result.reasoning);
              send({
                type: "reasoning",
                depth: result.reasoning.depth,
                text: result.reasoning.text,
                label: result.reasoning.label,
              });
            }
            if (result.blueprint) {
              blueprint = result.blueprint;
              send({ type: "blueprint", tasks: result.blueprint });
            }
            if (result.agents) {
              agentRuns.push(...result.agents);
            }

            const event: ToolEvent = {
              name: call.name,
              ok: result.ok,
              path: result.path,
              message: result.display,
              detail: result.detail,
              kind: result.kind,
            };
            toolsUsed.push(event);
            timeline.push({ type: "tool", tool: event });
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
          ...(timeline.length > 0 ? { events: timeline } : {}),
          tools: toolsUsed,
          ...(assistantReasoning.length > 0 ? { reasoning: assistantReasoning } : {}),
          ...(blueprint ? { blueprint } : {}),
          ...(agentRuns.length > 0 ? { agents: agentRuns } : {}),
          ...(asked.length > 0 ? { asks: asked } : {}),
        });
        send({
          type: "done",
          files: finalFiles.length,
          truncated,
          rounds: MAX_STEPS,
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
