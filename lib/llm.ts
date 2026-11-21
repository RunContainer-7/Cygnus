import { normalizeBaseUrl } from "./endpoints";
import { HOSTED_BASE_URL, hostedUpstreams } from "./hosted";
import type { ProviderConfig } from "./types";

export type WireMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

export type ParsedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

type CompletionTarget = {
  baseUrl: string;
  model: string;
};

type StreamResult = {
  content: string;
  toolCalls: ParsedToolCall[];
};

function reasoningDelta(delta: {
  reasoning?: unknown;
  reasoning_content?: unknown;
  thinking?: unknown;
  reasoning_details?: unknown;
}): string {
  if (typeof delta.reasoning === "string") return delta.reasoning;
  if (typeof delta.reasoning_content === "string") return delta.reasoning_content;
  // Ollama's thinking models expose the channel as `thinking`.
  if (typeof delta.thinking === "string") return delta.thinking;
  if (
    delta.reasoning &&
    typeof delta.reasoning === "object" &&
    typeof (delta.reasoning as { text?: unknown }).text === "string"
  ) {
    return (delta.reasoning as { text: string }).text;
  }
  if (Array.isArray(delta.reasoning_details)) {
    return delta.reasoning_details
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

function chatEndpoint(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) throw new Error("Add a provider endpoint in Settings first.");
  return `${normalized}/chat/completions`;
}

function friendlyError(status: number, body: string): string {
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 400);
  if (status === 401 || status === 403) {
    return `The provider rejected the API key (HTTP ${status}). ${detail}`;
  }
  if (status === 404) {
    return `The provider or model was not found (HTTP 404). Check the base URL and model name. ${detail}`;
  }
  if (status === 400 && /tool|function/i.test(detail)) {
    return `This model rejected tool calling (HTTP 400). Choose a tool-capable model, or switch to Local/BYOK with a model that supports tools. ${detail}`;
  }
  if (status === 429) {
    return `The provider is rate limiting this model (HTTP 429). Wait a moment or choose another model. ${detail}`;
  }
  return `The provider returned HTTP ${status}. ${detail}`;
}

function cleanToolName(name: string): string {
  // Harmony-format models can append channel markers to the function name,
  // e.g. "write_file<|channel|>commentary". The marker is transport noise,
  // not part of the tool name.
  const marker = name.indexOf("<|");
  return (marker >= 0 ? name.slice(0, marker) : name).trim();
}

function isLoopback(baseUrl: string): boolean {
  try {
    const host = new URL(normalizeBaseUrl(baseUrl)).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
  } catch {
    return false;
  }
}

/**
 * A 3B model on a 4-core CPU writes about 1.7 tokens per second. A single
 * write_file call can take ten minutes, so the cloud-sized four-minute limit
 * would abort a build that is working correctly. Local engines get thirty
 * minutes per turn; hosted and BYOK endpoints keep the shorter limit.
 */
function turnTimeoutMs(baseUrl: string): number {
  return isLoopback(baseUrl) ? 30 * 60_000 : 240_000;
}

function requestTargets(provider: ProviderConfig): CompletionTarget[] {
  if (provider.baseUrl === HOSTED_BASE_URL) {
    return hostedUpstreams(provider.model).map((entry) => ({
      baseUrl: entry.baseUrl,
      model: entry.model,
    }));
  }
  return [{ baseUrl: provider.baseUrl, model: provider.model }];
}

async function openCompletion(options: {
  target: CompletionTarget;
  messages: WireMessage[];
  tools: unknown[];
  apiKey?: string;
  signal?: AbortSignal;
  maxTokens?: number;
}): Promise<Response> {
  const { target, messages, tools, apiKey, signal, maxTokens } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const timeout = AbortSignal.timeout(turnTimeoutMs(target.baseUrl));
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const payload: Record<string, unknown> = {
    model: target.model,
    messages,
    stream: true,
    temperature: 0.3,
  };
  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }
  if (maxTokens && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  const response = await fetch(chatEndpoint(target.baseUrl), {
    method: "POST",
    headers,
    signal: combined,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(friendlyError(response.status, body));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `The endpoint returned ${contentType || "an unexpected response"} instead of a stream. ${body
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240)}`,
    );
  }

  return response;
}

async function parseStream(
  response: Response,
  onText?: (delta: string) => void,
  onReasoning?: (delta: string) => void,
): Promise<StreamResult> {
  if (!response.body) {
    throw new Error("The provider returned an empty response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const calls: ParsedToolCall[] = [];

  const handleLine = (rawLine: string): void => {
    const line = rawLine.replace(/\r$/, "");
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      (parsed as { error?: unknown }).error
    ) {
      const error = (parsed as { error?: { message?: string } | string }).error;
      const message =
        typeof error === "string" ? error : error?.message || "The provider returned an error.";
      throw new Error(message);
    }

    const delta = (parsed as {
      choices?: Array<{
        delta?: {
          content?: string | null;
          reasoning?: unknown;
          reasoning_content?: unknown;
          thinking?: unknown;
          reasoning_details?: unknown;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    })?.choices?.[0]?.delta;
    if (!delta) return;

    const thinking = reasoningDelta(delta);
    if (thinking) onReasoning?.(thinking);

    if (typeof delta.content === "string" && delta.content.length > 0) {
      content += delta.content;
      onText?.(delta.content);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = typeof part.index === "number" ? part.index : calls.length;
        while (calls.length <= index) {
          calls.push({ id: "", name: "", arguments: "" });
        }
        const target = calls[index];
        if (part.id) target.id = part.id;
        if (part.function?.name) target.name += part.function.name;
        if (typeof part.function?.arguments === "string") {
          target.arguments += part.function.arguments;
        }
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer.trim()) handleLine(buffer);

  const toolCalls = calls
    .map((call, index) => ({
      id: call.id || `call_${Date.now()}_${index}`,
      name: cleanToolName(call.name),
      arguments: call.arguments || "{}",
    }))
    .filter((call) => call.name);

  return { content, toolCalls };
}

export async function streamModelTurn(options: {
  provider: ProviderConfig;
  messages: WireMessage[];
  tools: unknown[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  maxTokens?: number;
}): Promise<StreamResult> {
  const { provider, messages, tools, signal, onText, onReasoning, maxTokens } = options;
  const targets = requestTargets(provider);
  const hosted = provider.baseUrl === HOSTED_BASE_URL;

  if (targets.length === 0) {
    throw new Error("That hosted model is not available. Choose another model in Settings.");
  }

  let lastError: unknown = null;
  let response: Response | null = null;

  for (let index = 0; index < targets.length; index += 1) {
    try {
      response = await openCompletion({
        target: targets[index],
        messages,
        tools,
        apiKey: hosted ? "" : provider.apiKey,
        signal,
        maxTokens,
      });
      break;
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : "";
      if (/aborted|timed? ?out/i.test(message)) {
        const minutes = Math.round(turnTimeoutMs(targets[index].baseUrl) / 60_000);
        throw new Error(
          `The model did not finish within ${minutes} minutes on one response. On-device models are slow on CPU; try a smaller model, ask for a smaller change, or press Stop and continue.`,
        );
      }
      // Hosted routes are shared free capacity. Try the next backend before
      // surfacing a failure; never retry after a stream has started.
      if (!hosted || index === targets.length - 1) {
        throw error;
      }
    }
  }

  if (!response) {
    throw new Error(
      "The free hosted models are busy right now. Try another hosted model, or switch to Local or BYOK in Settings.",
    );
  }

  return parseStream(response, onText, onReasoning);
}
