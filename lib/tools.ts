import { testProject } from "./appTest";
import { fetchPublicPage, runSubAgent, type SubAgentType } from "./subagents";
import type {
  AgentName,
  AgentRun,
  BlueprintTask,
  ProviderConfig,
  ReasoningNode,
  ToolKind,
} from "./types";
import {
  deleteFileSafe,
  listFiles,
  readFileSafe,
  writeFileSafe,
} from "./workspace";

const AGENT_LABELS: Record<AgentName, string> = {
  web_researcher: "Web researcher",
  expert: "Expert",
  catalyst: "Catalyst",
};

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or replace a file in the project. Always send the complete file contents, never a diff or a fragment.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Project-relative path, for example index.html or app.js.",
          },
          content: {
            type: "string",
            description: "The complete contents of the file.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from the project so you can edit it accurately.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Project-relative path of the file to read.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List every file in the project with its size.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search the project's text files for a word or phrase. Returns matching paths with line numbers. Use this instead of reading every file when you need to find where something lives.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to find, case-insensitive.",
          },
          path: {
            type: "string",
            description: "Optional project-relative folder or file prefix to narrow the search.",
          },
          max_results: {
            type: "number",
            description: "Maximum matches to return, from 1 to 80. Defaults to 40.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch a specific public web page and return its readable text. Use this for documentation, reference pages, or a URL the user gave you. Private and local addresses are blocked.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Public http(s) URL to read.",
          },
          max_chars: {
            type: "number",
            description: "Optional text limit, from 500 to 12000. Defaults to 12000.",
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file that should no longer exist in the project.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Project-relative path of the file to delete.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "blueprint",
      description:
        "Create or update the visible task list for the user. Call once at the start of any task with two or more steps, then again whenever a task starts or finishes. Always send the complete list, with exactly one task active at a time.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Stable short id, for example 1 or write-html.",
                },
                title: {
                  type: "string",
                  description: "Short user-facing task title.",
                },
                status: {
                  type: "string",
                  enum: ["pending", "active", "done"],
                  description: "Current task status.",
                },
              },
              required: ["id", "title", "status"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_agents",
      description:
        "Bring in specialised sub-agents. web_researcher searches the web and reads pages for current facts or docs. expert diagnoses the project when you are stuck, looping, or unsure. catalyst returns a fast execution plan with code-ready replacements. Give each agent a specific task; use this when their help is genuinely useful, not for work you can do directly.",
      parameters: {
        type: "object",
        properties: {
          agents: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["web_researcher", "expert", "catalyst"],
                },
                task: {
                  type: "string",
                  description:
                    "What the sub-agent should investigate, diagnose, or plan. Be specific about the files and symptoms.",
                },
              },
              required: ["type", "task"],
              additionalProperties: false,
            },
          },
        },
        required: ["agents"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nested_reasoning",
      description:
        "Open another visible layer of reasoning. Each call nests one level deeper inside your current thinking. Use it for hard tradeoffs, tricky bugs, or when you need to reason about your own reasoning. The user sees every layer. Go as deep as needed, then act.",
      parameters: {
        type: "object",
        properties: {
          thought: {
            type: "string",
            description:
              "The reasoning at this layer. State what you are unsure about and what it changes.",
          },
          question: {
            type: "string",
            description: "Optional question this layer is trying to answer.",
          },
        },
        required: ["thought"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "test_app",
      description:
        "Test the generated app directly. Checks that index.html exists, local asset references resolve, scripts compile, CSS blocks balance, no placeholders remain, and the preview route serves the page. Run this after a batch of writes and fix every failure.",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "Optional area to focus the report on, for example interaction or layout.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "user_ask",
      description:
        "Pause and ask the user one focused question when a missing decision blocks progress. The interface waits for their answer, then continues this same task automatically. Use it only when you cannot make a safe, reasonable assumption. Do not use it for routine choices or confirmation.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The single question the user needs to answer.",
          },
          options: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
            description:
              "Optional short answers the user can click. Add a free-text field unless the options are exhaustive.",
          },
          allow_free_text: {
            type: "boolean",
            description: "Whether the user may type an answer instead of choosing an option. Defaults to true.",
          },
        },
        required: ["question"],
        additionalProperties: false,
      },
    },
  },
];

export type ToolContext = {
  provider?: ProviderConfig;
  origin?: string;
  signal?: AbortSignal;
  emit?: (event: Record<string, unknown>) => void;
  transcript?: string;
  state?: { nestedDepth: number };
  ask?: (prompt: {
    question: string;
    options: string[];
    allowFreeText: boolean;
  }) => Promise<{ id: string; answer: string }>;
};

export type ToolResult = {
  ok: boolean;
  message: string;
  display: string;
  path?: string;
  detail?: string;
  kind: ToolKind;
  reasoning?: ReasoningNode;
  blueprint?: BlueprintTask[];
  agents?: AgentRun[];
};

function failure(message: string, display: string, kind: ToolKind = "file"): ToolResult {
  return { ok: false, message, display, kind };
}

function isTextFile(filePath: string): boolean {
  return /\.(?:html?|css|js|mjs|cjs|json|md|txt|svg|xml|yml|yaml)$/i.test(filePath);
}

function parseArguments(rawArguments: string): Record<string, unknown> | null {
  if (!rawArguments || !rawArguments.trim()) return {};
  try {
    const parsed = JSON.parse(rawArguments);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isAgentName(value: unknown): value is AgentName {
  return value === "web_researcher" || value === "expert" || value === "catalyst";
}

async function runAgents(
  projectId: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const rawAgents = Array.isArray(args.agents) ? args.agents : [];
  const requests: Array<{ type: SubAgentType; task: string }> = [];

  for (const entry of rawAgents.slice(0, 3)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { type?: unknown; task?: unknown };
    if (!isAgentName(record.type)) continue;
    if (typeof record.task !== "string" || !record.task.trim()) continue;
    requests.push({ type: record.type, task: record.task.trim() });
  }

  if (requests.length === 0) {
    return failure(
      "spawn_agents needs at least one agent with a type (web_researcher, expert, or catalyst) and a task.",
      "No valid sub-agent request",
      "agent",
    );
  }
  if (!context.provider) {
    return failure(
      "Sub-agents need an active model provider. Choose a model first.",
      "No model provider",
      "agent",
    );
  }

  const runs: AgentRun[] = [];
  const summaries: string[] = [];
  const stamp = Date.now();

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const id = `agent-${stamp}-${index}`;
    context.emit?.({
      type: "agent",
      id,
      agent: request.type,
      task: request.task,
      status: "running",
    });

    const result = await runSubAgent({
      type: request.type,
      task: request.task,
      provider: context.provider,
      projectId,
      transcript: context.transcript,
      signal: context.signal,
    });

    const run: AgentRun = {
      id,
      agent: result.agent,
      task: result.task,
      status: result.ok ? "done" : "error",
      summary: result.summary,
    };
    runs.push(run);
    context.emit?.({
      type: "agent",
      ...run,
    });
    summaries.push(
      `### ${AGENT_LABELS[result.agent]}\nTask: ${result.task}\n${result.summary}`,
    );
  }

  const finished = runs.filter((run) => run.status === "done").length;
  const labels = Array.from(new Set(runs.map((run) => AGENT_LABELS[run.agent]))).join(" + ");
  return {
    ok: finished > 0,
    message: `${summaries.join("\n\n")}\n\nUse this guidance and continue the task. Do not repeat the same failing tool call.`,
    display:
      finished === runs.length
        ? `${labels} finished`
        : `${labels} reported a problem`,
    detail: summaries.join("\n\n"),
    kind: "agent",
    agents: runs,
  };
}

function normalizeBlueprint(args: Record<string, unknown>): BlueprintTask[] {
  const rawTasks = Array.isArray(args.tasks) ? args.tasks : [];
  const tasks: BlueprintTask[] = [];
  const usedIds = new Set<string>();
  let activeSeen = false;

  for (let index = 0; index < rawTasks.length && tasks.length < 20; index += 1) {
    const entry = rawTasks[index];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { id?: unknown; title?: unknown; status?: unknown };
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) continue;
    const status =
      record.status === "done" || record.status === "active" || record.status === "pending"
        ? record.status
        : "pending";
    let id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim().slice(0, 40)
        : `task-${index + 1}`;
    while (usedIds.has(id)) id = `${id.slice(0, 36)}-${index + 1}`;
    usedIds.add(id);

    let normalized: BlueprintTask["status"] = status;
    if (normalized === "active") {
      if (activeSeen) normalized = "pending";
      else activeSeen = true;
    }
    tasks.push({ id, title: title.slice(0, 160), status: normalized });
  }

  return tasks;
}

export async function runTool(
  projectId: string,
  name: string,
  rawArguments: string,
  context: ToolContext = {},
): Promise<ToolResult> {
  const args = parseArguments(rawArguments);
  if (!args) {
    return failure(
      "The tool arguments were not valid JSON. Retry with a valid object.",
      "Bad tool arguments",
    );
  }

  try {
    if (name === "write_file") {
      const filePath = typeof args.path === "string" ? args.path.trim() : "";
      const content = typeof args.content === "string" ? args.content : "";
      if (!filePath) {
        return failure("write_file requires a path.", "Missing path");
      }
      if (!content.trim()) {
        return {
          ok: false,
          message: "write_file requires the complete file contents.",
          display: "Empty file content",
          path: filePath,
          kind: "file",
        };
      }
      const bytes = await writeFileSafe(projectId, filePath, content);
      return {
        ok: true,
        message: `Wrote ${bytes} bytes to ${filePath}.`,
        display: `Wrote ${filePath}`,
        path: filePath,
        kind: "file",
      };
    }

    if (name === "read_file") {
      const filePath = typeof args.path === "string" ? args.path.trim() : "";
      if (!filePath) {
        return failure("read_file requires a path.", "Missing path");
      }
      const content = await readFileSafe(projectId, filePath);
      return {
        ok: true,
        message: content,
        display: `Read ${filePath}`,
        path: filePath,
        kind: "file",
      };
    }

    if (name === "list_files") {
      const files = await listFiles(projectId);
      return {
        ok: true,
        message:
          files.length === 0
            ? "The project is empty."
            : files.map((file) => `${file.path} (${file.size} bytes)`).join("\n"),
        display:
          files.length === 0 ? "Listed files (empty)" : `Listed ${files.length} files`,
        kind: "file",
      };
    }

    if (name === "search_files") {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) {
        return failure("search_files requires a query.", "Missing search query");
      }
      const prefix = typeof args.path === "string" ? args.path.trim().replace(/^\/+/, "") : "";
      const requestedMax = typeof args.max_results === "number" ? args.max_results : 40;
      const limit = Math.min(Math.max(Math.round(requestedMax), 1), 80);
      const needle = query.toLowerCase();
      const matches: string[] = [];
      const files = await listFiles(projectId);

      for (const file of files) {
        if (matches.length >= limit) break;
        if (!isTextFile(file.path)) continue;
        if (prefix && !file.path.startsWith(prefix)) continue;
        if (file.path.toLowerCase().includes(needle)) {
          matches.push(`${file.path}:1: filename matches "${query}"`);
        }
        const content = await readFileSafe(projectId, file.path).catch(() => "");
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
          if (lines[index].toLowerCase().includes(needle)) {
            matches.push(`${file.path}:${index + 1}: ${lines[index].trim().slice(0, 260)}`);
          }
        }
      }

      return {
        ok: true,
        message:
          matches.length === 0
            ? `No matches for "${query}".`
            : matches.join("\n"),
        display:
          matches.length === 0
            ? `No matches for ${query}`
            : `Found ${matches.length} match${matches.length === 1 ? "" : "es"}`,
        detail: matches.join("\n"),
        kind: "file",
      };
    }

    if (name === "fetch_url") {
      const url = typeof args.url === "string" ? args.url.trim() : "";
      if (!url) {
        return failure("fetch_url requires a URL.", "Missing URL", "web");
      }
      const requested = typeof args.max_chars === "number" ? args.max_chars : 12_000;
      const maxChars = Math.min(Math.max(Math.round(requested), 500), 12_000);
      const page = await fetchPublicPage(url);
      if (!page.ok) {
        return failure(page.error ?? "The page could not be fetched.", "Fetch failed", "web");
      }
      const text = page.text.slice(0, maxChars);
      const header = [page.title ? `# ${page.title}` : "", page.url].filter(Boolean).join("\n");
      return {
        ok: true,
        message: `${header}\n\n${text}`,
        display: `Fetched ${page.title || new URL(page.url).hostname}`,
        detail: `${header}\n\n${text}`.slice(0, 4_000),
        kind: "web",
      };
    }

    if (name === "delete_file") {
      const filePath = typeof args.path === "string" ? args.path.trim() : "";
      if (!filePath) {
        return failure("delete_file requires a path.", "Missing path");
      }
      await deleteFileSafe(projectId, filePath);
      return {
        ok: true,
        message: `Deleted ${filePath}.`,
        display: `Deleted ${filePath}`,
        path: filePath,
        kind: "file",
      };
    }

    if (name === "blueprint") {
      const tasks = normalizeBlueprint(args);
      if (tasks.length === 0) {
        return failure(
          "blueprint needs at least one task with an id, title, and status.",
          "Empty blueprint",
          "blueprint",
        );
      }
      const done = tasks.filter((task) => task.status === "done").length;
      const listing = tasks
        .map(
          (task) =>
            `- [${task.status === "done" ? "x" : task.status === "active" ? ">" : " "}] ${task.title} (${task.status})`,
        )
        .join("\n");
      return {
        ok: true,
        message: `Blueprint updated: ${done}/${tasks.length} done.\n${listing}`,
        display: `Blueprint · ${done}/${tasks.length} done`,
        kind: "blueprint",
        blueprint: tasks,
      };
    }

    if (name === "spawn_agents") {
      return await runAgents(projectId, args, context);
    }

    if (name === "nested_reasoning") {
      const thought = typeof args.thought === "string" ? args.thought.trim() : "";
      if (!thought) {
        return failure(
          "nested_reasoning needs a non-empty thought.",
          "Empty reasoning layer",
          "reasoning",
        );
      }
      const state = context.state ?? { nestedDepth: 0 };
      state.nestedDepth += 1;
      const depth = state.nestedDepth;
      return {
        ok: true,
        message: `Nested reasoning layer ${depth} recorded. Call nested_reasoning again to go deeper, or continue the task with this conclusion.`,
        display: `Reasoning layer ${depth}`,
        kind: "reasoning",
        reasoning: {
          depth,
          text: thought.slice(0, 8_000),
          label: `Layer ${depth}`,
        },
      };
    }

    if (name === "user_ask") {
      const question = typeof args.question === "string" ? args.question.trim() : "";
      if (!question) {
        return failure("user_ask requires a question.", "Missing question", "ask");
      }
      const rawOptions = Array.isArray(args.options) ? args.options : [];
      const options = Array.from(
        new Set(
          rawOptions
            .filter((option): option is string => typeof option === "string")
            .map((option) => option.trim())
            .filter(Boolean),
        ),
      ).slice(0, 4);
      const allowFreeText = args.allow_free_text !== false;
      if (!context.ask) {
        return failure(
          "The user cannot be asked from this context. Make a reasonable assumption and continue.",
          "Can't reach the user",
          "ask",
        );
      }
      const result = await context.ask({
        question: question.slice(0, 600),
        options,
        allowFreeText,
      });
      return {
        ok: true,
        message: `The user answered: ${result.answer}`,
        display: "Asked the user",
        kind: "ask",
      };
    }

    if (name === "test_app") {
      const focus = typeof args.focus === "string" ? args.focus.trim() : "";
      const result = await testProject(projectId, context.origin);
      return {
        ok: result.ok,
        message: `${result.summary}\n${focus ? `Focus: ${focus}\n` : ""}\n${result.report}`,
        display: result.summary,
        detail: result.report,
        kind: "test",
      };
    }

    return failure(
      `Unknown tool "${name}". Use write_file, read_file, list_files, search_files, fetch_url, delete_file, blueprint, spawn_agents, nested_reasoning, test_app or user_ask.`,
      `Unknown tool ${name}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed.";
    return failure(`Error: ${message}`, message);
  }
}
