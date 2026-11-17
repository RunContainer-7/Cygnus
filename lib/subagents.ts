import { streamModelTurn, type WireMessage } from "./llm";
import type { ProviderConfig } from "./types";
import { listFiles, readChat, readFileSafe } from "./workspace";

export type SubAgentType = "web_researcher" | "expert" | "catalyst";

export type SubAgentResult = {
  agent: SubAgentType;
  task: string;
  ok: boolean;
  summary: string;
};

type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  page?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_TASK_CHARS = 4_000;
const MAX_SUMMARY_CHARS = 9_000;
const MAX_PAGE_CHARS = 6_000;
const MAX_BRIEF_CHARS = 24_000;

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

function stripHtml(html: string): string {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  return decodeEntities(withoutCode.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((value) => value > 255)) return true;
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  if (host.includes(":")) {
    return (
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe8") ||
      host.startsWith("fe9") ||
      host.startsWith("fea") ||
      host.startsWith("feb")
    );
  }

  return false;
}

function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return !isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

function decodeDuckDuckGoTarget(href: string): string {
  const decoded = decodeEntities(href);
  try {
    if (decoded.startsWith("//duckduckgo.com/l/")) {
      return new URL(`https:${decoded}`).searchParams.get("uddg") ?? "";
    }
    if (decoded.startsWith("/l/")) {
      return new URL(`https://duckduckgo.com${decoded}`).searchParams.get("uddg") ?? "";
    }
  } catch {
    return "";
  }
  return decoded;
}

async function duckDuckGoSearch(query: string): Promise<SearchHit[]> {
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  ).catch(() => null);
  if (!response?.ok) return [];

  const html = await response.text().catch(() => "");
  if (!html) return [];

  const links: Array<{ title: string; url: string }> = [];
  const snippets: string[] = [];
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);

  for (const match of anchors) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    if (/class="[^"]*result__a/i.test(attributes)) {
      const href = attributes.match(/href="([^"]+)"/i)?.[1] ?? "";
      const url = decodeDuckDuckGoTarget(href);
      const title = stripHtml(body);
      if (title && isPublicHttpUrl(url)) links.push({ title, url });
      continue;
    }
    if (/class="[^"]*result__snippet/i.test(attributes)) {
      const snippet = stripHtml(body);
      if (snippet) snippets.push(snippet);
    }
  }

  return links.slice(0, 5).map((link, index) => ({
    ...link,
    snippet: snippets[index] ?? "",
  }));
}

async function wikipediaSearch(query: string): Promise<SearchHit[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", "3");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  if (!response?.ok) return [];

  const payload = (await response.json().catch(() => null)) as
    | { query?: { search?: Array<{ title?: string; snippet?: string }> } }
    | null;
  const results = payload?.query?.search ?? [];
  return results
    .filter((entry) => typeof entry.title === "string")
    .map((entry) => ({
      title: entry.title!.replace(/\s+/g, " ").trim(),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.title!.replace(/ /g, "_"))}`,
      snippet: stripHtml(entry.snippet ?? ""),
    }));
}

export async function fetchPublicPage(rawUrl: string): Promise<{
  ok: boolean;
  url: string;
  title: string;
  text: string;
  error?: string;
}> {
  if (!isPublicHttpUrl(rawUrl)) {
    return {
      ok: false,
      url: rawUrl,
      title: "",
      text: "",
      error: "Only public http(s) URLs can be fetched.",
    };
  }

  const response = await fetch(rawUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response?.ok) {
    return {
      ok: false,
      url: rawUrl,
      title: "",
      text: "",
      error: response
        ? `The page returned HTTP ${response.status}.`
        : "The page could not be reached.",
    };
  }

  const type = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
    return {
      ok: false,
      url: response.url || rawUrl,
      title: "",
      text: "",
      error: `That URL returned ${type || "an unsupported content type"}, not text.`,
    };
  }

  if (response.url && !isPublicHttpUrl(response.url)) {
    return {
      ok: false,
      url: rawUrl,
      title: "",
      text: "",
      error: "That URL redirected to a private address, so it was blocked.",
    };
  }

  const body = await response.text().catch(() => "");
  const title = stripHtml(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  return {
    ok: true,
    url: response.url || rawUrl,
    title,
    text: stripHtml(body).slice(0, 12_000),
  };
}

async function readPage(hit: SearchHit): Promise<string> {
  const page = await fetchPublicPage(hit.url);
  return page.ok ? page.text.slice(0, MAX_PAGE_CHARS) : "";
}

async function webResearch(query: string): Promise<{
  hits: SearchHit[];
  error?: string;
}> {
  let hits = await duckDuckGoSearch(query).catch(() => [] as SearchHit[]);
  if (hits.length === 0) {
    hits = await wikipediaSearch(query).catch(() => [] as SearchHit[]);
  }
  if (hits.length === 0) {
    return {
      hits: [],
      error:
        "The web search returned no results. The search service may be unreachable from this machine; answer from the project and say the lookup failed.",
    };
  }

  const enriched = await Promise.all(
    hits.slice(0, 3).map(async (hit) => ({
      ...hit,
      page: await readPage(hit).catch(() => ""),
    })),
  );
  return { hits: enriched };
}

async function projectBrief(projectId: string): Promise<string> {
  const files = await listFiles(projectId);
  if (files.length === 0) return "The project is empty.";

  const blocks: string[] = [];
  let budget = MAX_BRIEF_CHARS;
  for (const file of files) {
    if (!/\.(?:html?|css|js|mjs|cjs|json|md|txt|svg)$/i.test(file.path)) continue;
    if (budget <= 0) {
      blocks.push("[remaining files omitted to fit the sub-agent context]");
      break;
    }
    const content = await readFileSafe(projectId, file.path).catch(() => "");
    const slice = content.slice(0, budget);
    blocks.push(`--- ${file.path} ---\n${slice}`);
    budget -= slice.length;
  }
  return blocks.join("\n\n") || "No text files yet.";
}

async function recentTranscript(projectId: string): Promise<string> {
  const messages = await readChat(projectId);
  return messages
    .slice(-10)
    .map((message) => `${message.role.toUpperCase()}: ${message.content.slice(0, 1_500)}`)
    .join("\n\n");
}

async function askModel(options: {
  provider: ProviderConfig;
  system: string;
  prompt: string;
  signal?: AbortSignal;
  maxTokens?: number;
}): Promise<string> {
  const wire: WireMessage[] = [
    { role: "system", content: options.system },
    { role: "user", content: options.prompt },
  ];
  let text = "";
  const result = await streamModelTurn({
    provider: options.provider,
    messages: wire,
    tools: [],
    signal: options.signal,
    maxTokens: options.maxTokens ?? 3_500,
    onText: (delta) => {
      text += delta;
    },
  });
  return (text || result.content || "").trim().slice(0, MAX_SUMMARY_CHARS);
}

const WEB_SYSTEM = `You are the Web Researcher sub-agent inside Cygnus, an app-building agent.
You are given a research task and a set of fetched web sources. Answer the task using only those sources.
Be concrete and brief: give the facts, versions, API names, or commands the main agent needs.
Cite sources as [1], [2], and so on. If the sources are stale or contradictory, say so plainly.
Do not write files and do not call tools.`;

const EXPERT_SYSTEM = `You are the Expert Agent inside Cygnus, an app-building agent.
The main agent is stuck, looping, or unsure. You receive its task, recent transcript, and the current project.
Diagnose the real problem and put it back on track.
Return exactly three short parts:
1. What is probably wrong (or what was missed).
2. The next 3 concrete actions, naming the tool to use for each.
3. Pitfalls to avoid.
Do not write files and do not call tools. Be specific to the project; no generic advice.`;

const CATALYST_SYSTEM = `You are the Catalyst Agent inside Cygnus, an app-building agent.
The main agent needs to move faster. Produce a tight execution plan it can apply immediately.
Include the exact files to change, the order of tool calls, and complete replacement file contents when a rewrite is faster than patching.
Keep the plan small enough to execute now. Do not ask questions and do not call tools.`;

function agentPrompt(type: SubAgentType, task: string, brief: string, transcript: string): string {
  if (type === "expert") {
    return `TASK\n${task}\n\nRECENT TRANSCRIPT\n${transcript || "(none)"}\n\nCURRENT PROJECT\n${brief}`;
  }
  return `TASK\n${task}\n\nRECENT TRANSCRIPT\n${transcript || "(none)"}\n\nCURRENT PROJECT\n${brief}`;
}

export async function runSubAgent(options: {
  type: SubAgentType;
  task: string;
  provider: ProviderConfig;
  projectId: string;
  transcript?: string;
  signal?: AbortSignal;
}): Promise<SubAgentResult> {
  const task = options.task.trim().slice(0, MAX_TASK_CHARS);
  if (!task) {
    return { agent: options.type, task: "", ok: false, summary: "The sub-agent task was empty." };
  }

  if (options.type === "web_researcher") {
    const research = await webResearch(task);
    if (research.hits.length === 0) {
      return {
        agent: options.type,
        task,
        ok: false,
        summary: research.error ?? "The web search returned no results.",
      };
    }

    const sources = research.hits
      .map(
        (hit, index) =>
          `[${index + 1}] ${hit.title}\n${hit.url}\n${hit.page || hit.snippet || "(no page text)"}`,
      )
      .join("\n\n");

    let summarized = true;
    const summary = await askModel({
      provider: options.provider,
      system: WEB_SYSTEM,
      prompt: `RESEARCH TASK\n${task}\n\nSOURCES\n${sources}`,
      signal: options.signal,
    }).catch((error: unknown) => {
      summarized = false;
      const message = error instanceof Error ? error.message : "The research model failed.";
      return `The sources were fetched, but the summarizer failed: ${message}`;
    });

    const citationList = research.hits
      .map((hit, index) => `[${index + 1}] ${hit.title} — ${hit.url}`)
      .join("\n");

    return {
      agent: options.type,
      task,
      ok: summarized && Boolean(summary),
      summary: `${summary || "No summary was produced."}\n\nSources:\n${citationList}`.slice(
        0,
        MAX_SUMMARY_CHARS,
      ),
    };
  }

  const brief = await projectBrief(options.projectId);
  const transcript = options.transcript?.trim()
    ? options.transcript.slice(-12_000)
    : await recentTranscript(options.projectId);

  const system = options.type === "expert" ? EXPERT_SYSTEM : CATALYST_SYSTEM;
  const prompt = agentPrompt(options.type, task, brief, transcript);
  let failed = false;
  let summary = await askModel({
    provider: options.provider,
    system,
    prompt,
    signal: options.signal,
  }).catch((error: unknown) => {
    failed = true;
    const message = error instanceof Error ? error.message : "The sub-agent failed.";
    return `The sub-agent could not finish: ${message}`;
  });

  // Reasoning models can spend the whole budget on hidden thinking and return
  // no visible text. Retry once with a hard request for the final answer.
  if (!failed && !summary) {
    summary = await askModel({
      provider: options.provider,
      system,
      prompt: `${prompt}\n\nReturn the final answer now in under 250 words. Start directly with the answer; do not include hidden reasoning.`,
      signal: options.signal,
      maxTokens: 3_500,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The sub-agent failed.";
      return `The sub-agent could not finish: ${message}`;
    });
  }

  return {
    agent: options.type,
    task,
    ok: Boolean(summary) && !summary.startsWith("The sub-agent could not finish:"),
    summary: summary || "The sub-agent returned no text.",
  };
}
