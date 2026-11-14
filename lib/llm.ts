import { normalizeBaseUrl } from "./endpoints";
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

type StreamResult = {
  content: string;
  toolCalls: ParsedToolCall[];
};

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
  if (status === 429) {
    return `The provider is rate limiting this key (HTTP 429). Wait a moment or choose another model. ${detail}`;
  }
  return `The provider returned HTTP ${status}. ${detail}`;
}

export async function streamModelTurn(options: {
  provider: ProviderConfig;
  messages: WireMessage[];
  tools: unknown[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}): Promise<StreamResult> {
  const { provider, messages, tools, signal, onText } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (provider.apiKey?.trim()) {
    headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  }

  const timeout = AbortSignal.timeout(240_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch(chatEndpoint(provider.baseUrl), {
    method: "POST",
    headers,
    signal: combined,
    body: JSON.stringify({
      model: provider.model,
      messages,
      tools,
      tool_choice: "auto",
      stream: true,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(friendlyError(response.status, body));
  }
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

    const delta = (parsed as {
      choices?: Array<{
        delta?: {
          content?: string | null;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    })?.choices?.[0]?.delta;
    if (!delta) return;

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
    .filter((call) => call.name)
    .map((call, index) => ({
      id: call.id || `call_${Date.now()}_${index}`,
      name: call.name,
      arguments: call.arguments || "{}",
    }));

  return { content, toolCalls };
}
