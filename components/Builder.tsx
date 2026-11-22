"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CommandPalette, { type PaletteAction } from "@/components/CommandPalette";
import FileDrawer from "@/components/FileDrawer";
import Icon from "@/components/Icon";
import ModeMenu from "@/components/ModeMenu";
import ModelMenu from "@/components/ModelMenu";
import PublishPanel from "@/components/PublishPanel";
import StudioPanel from "@/components/StudioPanel";
import { useProvider } from "@/components/ProviderContext";
import { endpointHost, isLocalEndpoint } from "@/lib/endpoints";
import { isDemo, isHosted, isKeylessProvider, providerLabel } from "@/lib/providers";
import { isCygnusLocalProvider } from "@/lib/cygnus05Shared";
import { loadMode, saveMode, type BuildMode } from "@/lib/modes";
import type { MoveAction } from "@/lib/moves";
import type {
  AgentRun,
  AskPrompt,
  BlueprintTask,
  ChatEvent,
  ChatMessage,
  ProjectData,
  ReasoningNode,
  ToolEvent,
} from "@/lib/types";

type PanelId =
  | "preview"
  | "code"
  | "files"
  | "changes"
  | "assets"
  | "console"
  | "history"
  | "settings";

const PANEL_TABS: Array<{ id: PanelId; label: string }> = [
  { id: "preview", label: "Preview" },
  { id: "code", label: "Code" },
  { id: "files", label: "Files" },
  { id: "changes", label: "Changes" },
  { id: "assets", label: "Assets" },
  { id: "console", label: "Console" },
  { id: "history", label: "History" },
  { id: "settings", label: "Setup" },
];

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function updateLast(
  messages: ChatMessage[],
  update: (message: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const copy = [...messages];
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    if (copy[index].role === "assistant") {
      copy[index] = update(copy[index]);
      break;
    }
  }
  return copy;
}

const AGENT_LABELS: Record<AgentRun["agent"], string> = {
  web_researcher: "Web researcher",
  expert: "Expert",
  catalyst: "Catalyst",
  harmoniser: "Harmoniser",
};

function lastReasoningIndex(nodes: ReasoningNode[], depth: number): number {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index].depth === depth) return index;
  }
  return -1;
}

export default function Builder({
  projectId,
  initialPrompt,
}: {
  projectId: string;
  initialPrompt: string | null;
}) {
  const router = useRouter();
  const { provider } = useProvider();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [drawerFile, setDrawerFile] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [release, setRelease] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [panel, setPanel] = useState<PanelId>("preview");
  const [codeFile, setCodeFile] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [mode, setMode] = useState<BuildMode>("chat");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [push, setPush] = useState<{ busy: boolean; result?: string; error?: string }>({
    busy: false,
  });
  const [repoDraft, setRepoDraft] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<
    "snapshots" | "design" | "notes" | "data" | "moves"
  >("snapshots");
  const [duplicating, setDuplicating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const chatHydrated = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoSent = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "This workspace no longer exists."
          : "Could not load this workspace.",
      );
    }
    const data = (await response.json()) as ProjectData;
    setProject(data);
    // Load the saved transcript once. A slower duplicate refresh (React's dev
    // double-effect, or a manual refresh during a turn) must never replace the
    // live transcript with the copy that existed before the turn started.
    if (!chatHydrated.current) {
      chatHydrated.current = true;
      setMessages(data.chat ?? []);
    }
    return data;
  }, [projectId]);

  useEffect(() => {
    setMode(loadMode());
    refresh().catch((error: Error) => setLoadError(error.message));
  }, [refresh]);

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, atBottom]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || streaming) return;

    const config = provider;
    setModelMenuOpen(false);
    setInput("");
    setStreaming(true);
    setMessages((previous) => [
      ...previous,
      { role: "user", content: text },
      {
        role: "assistant",
        content: "",
        tools: [],
        startedAt: new Date().toISOString(),
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: text, provider: config, mode }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail.slice(0, 400) || `Request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The server returned no stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const apply = (event: Record<string, unknown>) => {
        if (event.type === "status" && typeof event.text === "string") {
          const activity = event.text;
          setMessages((previous) =>
            updateLast(previous, (message) => {
              const activities = message.activities ?? [];
              return {
                ...message,
                activity,
                activities:
                  activities[activities.length - 1] === activity
                    ? activities
                    : [...activities, activity].slice(-40),
              };
            }),
          );
          return;
        }
        if (event.type === "text" && typeof event.value === "string") {
          const delta = event.value;
          setMessages((previous) =>
            updateLast(previous, (message) => {
              const events: ChatEvent[] = [...(message.events ?? [])];
              const last = events[events.length - 1];
              if (last && last.type === "text") {
                events[events.length - 1] = { type: "text", text: last.text + delta };
              } else {
                events.push({ type: "text", text: delta });
              }
              return { ...message, content: message.content + delta, events };
            }),
          );
          return;
        }
        if (event.type === "tool") {
          const tool: ToolEvent = {
            name: String(event.name ?? "tool"),
            ok: Boolean(event.ok),
            path: typeof event.path === "string" ? event.path : undefined,
            message: String(event.message ?? "Done"),
            detail: typeof event.detail === "string" ? event.detail : undefined,
            kind:
              typeof event.kind === "string" ? (event.kind as ToolEvent["kind"]) : undefined,
          };
          setMessages((previous) =>
            updateLast(previous, (message) => ({
              ...message,
              tools: [...(message.tools ?? []), tool],
              events: [...(message.events ?? []), { type: "tool" as const, tool }],
            })),
          );
          return;
        }
        if (event.type === "reasoning") {
          const depth = typeof event.depth === "number" ? event.depth : 0;
          const text = String(event.text ?? "");
          if (!text) return;
          const append = Boolean(event.append);
          const label = typeof event.label === "string" ? event.label : undefined;
          setMessages((previous) =>
            updateLast(previous, (message) => {
              const nodes = [...(message.reasoning ?? [])];
              if (append) {
                const index = lastReasoningIndex(nodes, depth);
                if (index >= 0) {
                  nodes[index] = { ...nodes[index], text: nodes[index].text + text };
                } else {
                  nodes.push({
                    depth,
                    text,
                    label: label ?? (depth === 0 ? "Thinking" : `Layer ${depth}`),
                  });
                }
              } else {
                nodes.push({
                  depth,
                  text,
                  label: label ?? (depth === 0 ? "Thinking" : `Layer ${depth}`),
                });
              }
              return { ...message, reasoning: nodes };
            }),
          );
          return;
        }
        if (event.type === "blueprint" && Array.isArray(event.tasks)) {
          const tasks = event.tasks as BlueprintTask[];
          setMessages((previous) =>
            updateLast(previous, (message) => ({ ...message, blueprint: tasks })),
          );
          return;
        }
        if (event.type === "agent") {
          const run: AgentRun = {
            id: String(event.id ?? `${String(event.agent)}-${String(event.task)}`),
            agent: String(event.agent ?? "expert") as AgentRun["agent"],
            task: String(event.task ?? ""),
            status:
              event.status === "done" || event.status === "error" ? event.status : "running",
            summary: typeof event.summary === "string" ? event.summary : undefined,
          };
          setMessages((previous) =>
            updateLast(previous, (message) => {
              const runs = [...(message.agents ?? [])];
              const index = runs.findIndex((entry) => entry.id === run.id);
              if (index >= 0) runs[index] = { ...runs[index], ...run };
              else runs.push(run);
              return { ...message, agents: runs };
            }),
          );
          return;
        }
        if (event.type === "ask" && typeof event.id === "string" && typeof event.question === "string") {
          const ask: AskPrompt = {
            id: event.id,
            question: event.question,
            options: Array.isArray(event.options)
              ? event.options.filter((option): option is string => typeof option === "string")
              : undefined,
            allowFreeText: event.allowFreeText !== false,
            status: "pending",
          };
          setMessages((previous) =>
            updateLast(previous, (message) => {
              const asks = [...(message.asks ?? [])];
              const index = asks.findIndex((entry) => entry.id === ask.id);
              if (index >= 0) asks[index] = ask;
              else asks.push(ask);
              return { ...message, asks };
            }),
          );
          return;
        }
        if (event.type === "error") {
          const detail = String(event.message ?? "Something went wrong.");
          setMessages((previous) =>
            updateLast(previous, (message) => ({
              ...message,
              error: detail,
              asks: message.asks?.map((ask) =>
                ask.status === "pending" ? { ...ask, status: "cancelled" as const } : ask,
              ),
            })),
          );
          return;
        }
        if (event.type === "done") {
          setMessages((previous) =>
            updateLast(previous, (message) => ({
              ...message,
              endedAt: message.endedAt ?? new Date().toISOString(),
            })),
          );
          if (event.truncated) {
            const rounds = typeof event.rounds === "number" ? event.rounds : 10;
            setMessages((previous) =>
              updateLast(previous, (message) => ({
                ...message,
                content:
                  (message.content ? `${message.content}\n\n` : "") +
                  `Stopped after ${rounds} tool rounds — ask me to continue.`,
              })),
            );
          }
          setRelease((value) => value + 1);
          window.dispatchEvent(new Event("cygnus:usage"));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, "");
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            apply(JSON.parse(payload) as Record<string, unknown>);
          } catch {
            // Ignore a partial frame; the next chunk completes it.
          }
        }
      }

      const latest = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      if (latest.ok) setProject((await latest.json()) as ProjectData);
      setRelease((value) => value + 1);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const detail = error instanceof Error ? error.message : "Something went wrong.";
        setMessages((previous) =>
          updateLast(previous, (message) => ({ ...message, error: message.error ?? detail })),
        );
        // Put the prompt back so a provider failure does not erase what the
        // user typed.
        setInput((current) => current || text);
      }
    } finally {
      // A turn can fail or be stopped after some files were written. Refresh
      // the project and the preview so the user sees what actually exists
      // instead of the page from before the turn.
      void fetch(`/api/projects/${projectId}`, { cache: "no-store" })
        .then(async (response) => {
          if (response.ok) setProject((await response.json()) as ProjectData);
        })
        .catch(() => undefined);
      setRelease((value) => value + 1);
      setMessages((previous) =>
        updateLast(previous, (message) => ({
          ...message,
          endedAt: message.endedAt ?? new Date().toISOString(),
          asks: message.asks?.map((ask) =>
            ask.status === "pending" ? { ...ask, status: "cancelled" as const } : ask,
          ),
        })),
      );
      setStreaming(false);
      abortRef.current = null;
      window.dispatchEvent(new Event("cygnus:usage"));
    }
  }

  useEffect(() => {
    if (!project || !initialPrompt || autoSent.current) return;
    autoSent.current = true;
    setMobileView("chat");
    // Drop the one-shot prompt from the URL so a reload does not send it again.
    router.replace(`/build/${projectId}`, { scroll: false });
    void send(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, initialPrompt]);

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(index);
      window.setTimeout(() => {
        setCopied((value) => (value === index ? null : value));
      }, 1600);
    } catch {
      setCopied(null);
    }
  }

  async function pushToGithub() {
    if (push.busy) return;
    setPush({ busy: true });
    try {
      const response = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...(project?.github ? {} : { repo: repoDraft.trim() }),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        files?: number;
        repo?: string;
        commitUrl?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not push to GitHub.");
      setPush({
        busy: false,
        result: `Pushed ${data.files ?? 0} files to ${data.repo ?? "GitHub"}.`,
      });
      await refresh();
      setRepoDraft("");
    } catch (error) {
      setPush({
        busy: false,
        error: error instanceof Error ? error.message : "Could not push to GitHub.",
      });
    }
  }

  async function duplicateProject() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        throw new Error(data.error ?? "Could not duplicate this project.");
      }
      router.push(`/build/${data.id}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not duplicate this project.");
    } finally {
      setDuplicating(false);
    }
  }

  function openStudio(tab: "snapshots" | "design" | "notes" | "data" | "moves") {
    setStudioTab(tab);
    setStudioOpen(true);
  }

  function runMoveAction(action: MoveAction) {
    if (action === "duplicate") {
      void duplicateProject();
      return;
    }
    if (action === "publish") {
      setPublishOpen(true);
      return;
    }
    if (action === "export") {
      window.location.href = `/api/projects/${projectId}/export`;
      return;
    }
    if (action === "settings") {
      router.push("/settings");
      return;
    }
    if (action === "templates") {
      router.push("/templates");
      return;
    }
    if (action === "device" || action === "console") {
      setPanel(action === "console" ? "console" : "preview");
      setMobileView("preview");
      return;
    }
    if (action === "palette") {
      setPaletteOpen(true);
      return;
    }
    openStudio(action.replace("studio:", "") as "snapshots" | "design" | "notes" | "data" | "moves");
  }

  function insertPrompt(prompt: string) {
    setInput(prompt);
    setMobileView("chat");
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function removeProject() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (response.ok) router.push("/");
    else setDeleteArmed(false);
  }

  async function answerAsk(id: string, answer: string) {
    const text = answer.trim();
    if (!text) return;

    setMessages((previous) =>
      updateLast(previous, (message) => ({
        ...message,
        asks: (message.asks ?? []).map((ask) =>
          ask.id === id
            ? { ...ask, status: "answered" as const, answer: text, error: undefined }
            : ask,
        ),
      })),
    );

    try {
      const response = await fetch("/api/chat/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, answer: text }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Could not send that answer (${response.status}).`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not send that answer.";
      setMessages((previous) =>
        updateLast(previous, (message) => ({
          ...message,
          asks: (message.asks ?? []).map((ask) =>
            ask.id === id
              ? { ...ask, status: "pending" as const, answer: undefined, error: detail }
              : ask,
          ),
        })),
      );
    }
  }

  const files = project?.files ?? [];
  const busy = streaming;
  const cygnusLab = isCygnusLocalProvider(provider);
  const activeCode = files.find((file) => file.path === codeFile) ?? files[0];
  const consoleEntries = messages.flatMap((message, messageIndex) => [
    ...(message.tools ?? []).map((tool) => ({
      key: `${messageIndex}-${tool.name}-${tool.path ?? tool.message}`,
      kind: tool.ok ? "ok" : "warn",
      text: `${tool.name} · ${tool.message}`,
      path: tool.path,
    })),
    ...(message.error
      ? [{ key: `${messageIndex}-error`, kind: "bad", text: message.error, path: undefined }]
      : []),
  ]);
  const changeEntries = messages
    .flatMap((message, messageIndex) =>
      (message.tools ?? []).map((tool, toolIndex) => ({
        ...tool,
        key: `${messageIndex}-${toolIndex}`,
      })),
    )
    .filter((tool) => tool.path);
  const assetGroups = Object.entries(
    files.reduce<Record<string, { count: number; bytes: number }>>((groups, file) => {
      const ext = file.path.includes(".")
        ? file.path.split(".").pop()!.toLowerCase()
        : "other";
      groups[ext] = groups[ext] ?? { count: 0, bytes: 0 };
      groups[ext].count += 1;
      groups[ext].bytes += file.size;
      return groups;
    }, {}),
  ).sort((a, b) => b[1].count - a[1].count);
  const panelMeta: Record<Exclude<PanelId, "preview">, string> = {
    code: `${files.length} files`,
    files: `${files.length} files`,
    changes: `${changeEntries.length} writes`,
    assets: `${assetGroups.length} types`,
    console: `${consoleEntries.length} events`,
    history: `${messages.length} messages`,
    settings: isKeylessProvider(provider) ? "no key" : "key saved",
  };

  const paletteActions: PaletteAction[] = [
    {
      id: "new-app",
      group: "App",
      label: "New app",
      hint: "Home",
      run: () => router.push("/"),
    },
    {
      id: "duplicate",
      group: "App",
      label: "Duplicate this project",
      hint: "Remix a copy",
      run: () => void duplicateProject(),
    },
    {
      id: "publish",
      group: "Ship",
      label: "Publish this app",
      hint: "Free hosting",
      run: () => setPublishOpen(true),
    },
    {
      id: "export",
      group: "Ship",
      label: "Download project zip",
      hint: "Export",
      run: () => {
        window.location.href = `/api/projects/${projectId}/export`;
      },
    },
    {
      id: "open-preview",
      group: "Ship",
      label: "Open preview in a new tab",
      run: () => window.open(`/api/preview/${projectId}/index.html`, "_blank"),
    },
    ...PANEL_TABS.map((tab) => ({
      id: `panel-${tab.id}`,
      group: "Go to",
      label: tab.label,
      run: () => {
        setPanel(tab.id);
        setMobileView("preview");
      },
    })),
    ...(["chat", "plan", "build"] as const).map((next) => ({
      id: `mode-${next}`,
      group: "Mode",
      label: `Switch to ${next} mode`,
      run: () => {
        setMode(next);
        saveMode(next);
      },
    })),
    {
      id: "studio-snapshots",
      group: "Studio",
      label: "Checkpoints and rollback",
      run: () => openStudio("snapshots"),
    },
    {
      id: "studio-design",
      group: "Studio",
      label: "Design tokens",
      run: () => openStudio("design"),
    },
    {
      id: "studio-notes",
      group: "Studio",
      label: "Project notes",
      run: () => openStudio("notes"),
    },
    {
      id: "studio-data",
      group: "Studio",
      label: "Import CSV data",
      run: () => openStudio("data"),
    },
    {
      id: "studio-moves",
      group: "Studio",
      label: "Browse 64 borrowed moves",
      run: () => openStudio("moves"),
    },
    {
      id: "reload",
      group: "Preview",
      label: "Reload the preview",
      run: () => setRelease((value) => value + 1),
    },
    {
      id: "settings",
      group: "App",
      label: "Open settings",
      run: () => router.push("/settings"),
    },
  ];

  return (
    <div className="builder">
      <nav
        className={`workspace-tabs ${mobileView === "chat" ? "chat-open" : ""}`}
        role="tablist"
        aria-label="Workspace panels"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === "chat"}
          className={`workspace-tab chat-tab ${mobileView === "chat" ? "active" : ""}`}
          onClick={() => setMobileView("chat")}
        >
          Chat
        </button>
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={panel === tab.id}
            className={`workspace-tab ${panel === tab.id ? "active" : ""}`}
            onClick={() => {
              setPanel(tab.id);
              setMobileView("preview");
            }}
          >
            {tab.label}
          </button>
        ))}
        <span className="workspace-tabs-meta">
          <a
            className={`workspace-tool workspace-export ${files.length === 0 ? "disabled" : ""}`}
            href={files.length > 0 ? `/api/projects/${projectId}/export` : undefined}
            aria-disabled={files.length === 0}
            onClick={(event) => {
              if (files.length === 0) event.preventDefault();
            }}
            title={
              files.length > 0
                ? "Download every project file as a .zip"
                : "There are no files to export yet"
            }
          >
            <Icon name="download" size={12} />
            Export
          </a>
          <button
            type="button"
            className="workspace-tool"
            onClick={() => openStudio("snapshots")}
            title="Checkpoints, design tokens, notes, CSV and moves"
          >
            Studio
          </button>
          <button
            type="button"
            className="workspace-tool"
            onClick={() => setPaletteOpen(true)}
            title="Command palette (Ctrl/Cmd + K)"
          >
            ⌘K
          </button>
          <span>{files.length} files</span>
        </span>
      </nav>

      <main className={`builder-main mobile-${mobileView}`}>
        <section className="chat-col">
          <div
            className="chat-scroll"
            ref={scrollRef}
            onScroll={(event) => {
              const element = event.currentTarget;
              setAtBottom(
                element.scrollHeight - element.scrollTop - element.clientHeight < 120,
              );
            }}
          >
            {loadError ? (
              <div className="error-card">
                <strong>Workspace unavailable</strong>
                <p>{loadError}</p>
                <p className="hint">Go back home and start a new project.</p>
              </div>
            ) : null}

            {!project && !loadError ? <p className="chat-loading">Opening workspace…</p> : null}

            {project && messages.length === 0 && !busy ? (
              <div className="chat-empty">
                <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true">
                  <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5">
                    <path d="M16 4 11 15l5 5 5-5Z" />
                    <path d="M11 15 5 19M21 15l6 4M16 20v7" />
                  </g>
                  <g fill="currentColor">
                    <circle cx="16" cy="4" r="2" />
                    <circle cx="11" cy="15" r="1.3" />
                    <circle cx="21" cy="15" r="1.3" />
                    <circle cx="16" cy="27" r="1.3" />
                  </g>
                </svg>
                <h2>{cygnusLab ? "Talk to Cygnus 0.5 Femto" : "What are we building?"}</h2>
                <p>
                  {cygnusLab
                    ? "A 5.3M-parameter model trained from scratch on this PC. Chat only, still learning English, and not recommended for real work. Pick Cygnus 0.5 for conversation."
                    : "Describe it below. Changes show up in the preview."}
                </p>
                <div className="example-chips">
                  {[
                    "A landing page for a coffee subscription",
                    "A kanban task board",
                    "A personal finance dashboard",
                  ].map((idea) => (
                    <button key={idea} type="button" onClick={() => void send(idea)}>
                      {idea}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message, index) =>
              message.role === "user" ? (
                <div className="msg user" key={`user-${index}`}>
                  <div className="bubble">{message.content}</div>
                </div>
              ) : (
                <div className="msg assistant" key={`assistant-${index}`}>
                  {message.blueprint && message.blueprint.length > 0 ? (
                    <BlueprintCard tasks={message.blueprint} />
                  ) : null}
                  {(() => {
                    const liveMessage = busy && index === messages.length - 1;
                    const showThinking =
                      Boolean(message.reasoning && message.reasoning.length > 0) ||
                      (liveMessage &&
                        Boolean(
                          (message.activities && message.activities.length > 0) ||
                            message.activity,
                        ));
                    return (
                      <>
                        {liveMessage &&
                        message.activity &&
                        !showThinking &&
                        !(message.events && message.events.length > 0) ? (
                          <div className="chat-status" role="status">
                            <span className="chat-status-dot" aria-hidden="true" />
                            <span>{message.activity}</span>
                          </div>
                        ) : null}
                        {showThinking ? (
                          <ThinkingBlock
                            nodes={message.reasoning ?? []}
                            activities={message.activities ?? []}
                            live={liveMessage}
                            startedAt={message.startedAt}
                            endedAt={message.endedAt}
                          />
                        ) : null}
                        {message.events && message.events.length > 0 ? (
                          <Narration
                            events={message.events}
                            activity={message.activity}
                            content={message.content}
                            live={liveMessage}
                            startedAt={message.startedAt}
                            endedAt={message.endedAt}
                            onOpen={(path) => {
                              setDrawerFile(path);
                              setFilesOpen(true);
                            }}
                          />
                        ) : message.content ? (
                          <div className="bubble assistant-bubble">{message.content}</div>
                        ) : null}
                      </>
                    );
                  })()}
                  {message.content ? (
                    <div className="msg-actions">
                      <button
                        type="button"
                        className="msg-action"
                        onClick={() => void copyMessage(message.content, index)}
                      >
                        {copied === index ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : null}
                  {message.asks?.map((ask) => (
                    <AskCard
                      key={ask.id}
                      ask={ask}
                      onAnswer={(answer) => void answerAsk(ask.id, answer)}
                    />
                  ))}
                  {message.agents && message.agents.length > 0 ? (
                    <AgentRuns runs={message.agents} />
                  ) : null}
                  {message.tools &&
                  message.tools.length > 0 &&
                  !(message.events && message.events.length > 0) ? (
                    <details
                      className="tool-list"
                      open={
                        busy && index === messages.length - 1 ? true : !message.content ? true : undefined
                      }
                    >
                      <summary>
                        <span>Activity</span>
                        <em>
                          {message.tools.length} step{message.tools.length === 1 ? "" : "s"}
                        </em>
                      </summary>
                      <div className="tool-chips">
                        {message.tools.map((tool, toolIndex) => (
                        <button
                          type="button"
                          className={`tool-chip ${tool.ok ? "ok" : "warn"}`}
                          key={`${tool.name}-${toolIndex}`}
                          disabled={!tool.path}
                          title={tool.detail ?? (tool.path ? `Open ${tool.path}` : tool.message)}
                          onClick={() => {
                            if (!tool.path) return;
                            setDrawerFile(tool.path);
                            setFilesOpen(true);
                          }}
                        >
                          <span aria-hidden="true">{tool.ok ? "✓" : "!"}</span>
                          <span className="tool-name">{tool.name}</span>
                          <span>{tool.message}</span>
                          {tool.path ? <code>{tool.path}</code> : null}
                        </button>
                      ))}
                      </div>
                    </details>
                  ) : null}
                  {message.error ? (
                    <div className="error-card">
                      <strong>That didn&apos;t work</strong>
                      <p>{message.error}</p>
                      <p className="hint">
                        {cygnusLab
                          ? "Cygnus 0.5 Femto is an experimental local model. Pick Cygnus 0.5 for conversation, or switch to a tool-capable model to build."
                          : "Check the model settings, the API key, and that the provider supports tool calling. On-device models download on first use; local servers must be running."}
                      </p>
                    </div>
                  ) : null}
                  {!message.content &&
                  !message.error &&
                  !(message.asks?.some((ask) => ask.status === "pending")) &&
                  !(message.events && message.events.length > 0) &&
                  !(message.activities && message.activities.length > 0) &&
                  busy &&
                  index === messages.length - 1 ? (
                    <div className="typing" aria-label="Cygnus is working">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : null}
                </div>
              ),
            )}

            <div ref={bottomRef} />
          </div>

          <form
            className="composer chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder={
                cygnusLab
                  ? "Chat with Cygnus 0.5 Femto (experimental)…"
                  : "Describe a change, or ask for something new…"
              }
              aria-label="Message Cygnus"
            />
            <div className="composer-row">
              <ModeMenu
                mode={mode}
                onChange={(next) => {
                  setMode(next);
                  saveMode(next);
                }}
              />
              <div className="composer-model-wrap">
                <button
                  type="button"
                  className="composer-model"
                  aria-expanded={modelMenuOpen}
                  aria-haspopup="dialog"
                  onClick={() => setModelMenuOpen((value) => !value)}
                >
                  <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
                  <span className="composer-model-label">{providerLabel(provider)}</span>
                  <span aria-hidden="true" className="composer-model-caret">
                    ⌄
                  </span>
                </button>
                {modelMenuOpen ? (
                  <ModelMenu
                    onClose={() => setModelMenuOpen(false)}
                    onManage={() => {
                      setModelMenuOpen(false);
                      router.push("/settings");
                    }}
                  />
                ) : null}
              </div>
              {busy ? (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => abortRef.current?.abort()}
                >
                  Stop
                </button>
              ) : (
                <button type="submit" className="primary-btn" disabled={!input.trim()}>
                  Send
                </button>
              )}
            </div>
            <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
          </form>
          {!atBottom ? (
            <button
              type="button"
              className="scroll-latest"
              onClick={() => {
                setAtBottom(true);
                bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
              }}
            >
              ↓ Latest
            </button>
          ) : null}
        </section>

        <section className="preview-col">
          <div className="preview-toolbar">
            <span className="panel-title">
              {PANEL_TABS.find((tab) => tab.id === panel)?.label}
            </span>
            <div className="preview-actions">
              {panel === "preview" ? (
                <>
                  <div className="device-switch" role="group" aria-label="Preview size">
                    {(["desktop", "tablet", "mobile"] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={device === size ? "active" : ""}
                        onClick={() => setDevice(size)}
                      >
                        {size[0].toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="publish-trigger"
                    onClick={() => setPublishOpen(true)}
                    title="Publish this app"
                  >
                    {project?.publish ? "Published" : "Publish"}
                  </button>
                  <a
                    className={`export-trigger ${files.length === 0 ? "disabled" : ""}`}
                    href={files.length > 0 ? `/api/projects/${projectId}/export` : undefined}
                    aria-disabled={files.length === 0}
                    onClick={(event) => {
                      if (files.length === 0) event.preventDefault();
                    }}
                    title={
                      files.length > 0
                        ? "Download every project file as a .zip"
                        : "There are no files to export yet"
                    }
                  >
                    <Icon name="download" size={13} />
                    Export .zip
                  </a>
                  <button
                    type="button"
                    onClick={() => setRelease((value) => value + 1)}
                    title="Reload preview"
                  >
                    Reload
                  </button>
                  <a
                    href={`/api/preview/${projectId}/index.html`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open preview in a new tab"
                  >
                    Open
                  </a>
                </>
              ) : (
                <span className="panel-count">{panelMeta[panel]}</span>
              )}
            </div>
          </div>
          {panel === "preview" ? (
            <div className={`preview-frame-wrap ${device}`}>
              {busy ? (
                <div className="preview-building">{cygnusLab ? "Chatting…" : "Building…"}</div>
              ) : null}
              <iframe
                key={release}
                src={`/api/preview/${projectId}/index.html?v=${release}`}
                title="Live app preview"
                className="preview-frame"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              />
            </div>
          ) : null}

          {panel === "code" ? (
            <div className="code-panel">
              <ul className="code-files" aria-label="Files">
                {files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      className={file.path === activeCode?.path ? "active" : ""}
                      onClick={() => setCodeFile(file.path)}
                    >
                      {file.path}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="code-view">
                <div className="code-head">{activeCode?.path ?? "No file selected"}</div>
                <pre>{activeCode?.content ?? "Ask Cygnus to write something."}</pre>
              </div>
            </div>
          ) : null}

          {panel === "files" ? (
            <div className="files-panel">
              {files.length === 0 ? (
                <p className="panel-empty">No files yet. Ask Cygnus to build something.</p>
              ) : (
                <div className="files-grid">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => {
                        setCodeFile(file.path);
                        setPanel("code");
                      }}
                    >
                      <strong>{file.path}</strong>
                      <span>{formatSize(file.size)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {panel === "console" ? (
            <div className="console-panel">
              {consoleEntries.length === 0 ? (
                <p className="panel-empty">
                  Tool calls and errors from this chat show up here.
                </p>
              ) : (
                consoleEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`console-row ${entry.kind}`}
                    disabled={!entry.path}
                    onClick={() => {
                      if (!entry.path) return;
                      setCodeFile(entry.path);
                      setPanel("code");
                    }}
                  >
                    <span className="console-kind">{entry.kind === "ok" ? "✓" : "!"}</span>
                    <span>{entry.text}</span>
                    {entry.path ? <code>{entry.path}</code> : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
          {panel === "changes" ? (
            <div className="console-panel">
              {changeEntries.length === 0 ? (
                <p className="panel-empty">
                  File writes from the model show up here. Ask Cygnus to build or edit something.
                </p>
              ) : (
                changeEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`console-row ${entry.ok ? "ok" : "warn"}`}
                    disabled={!entry.path}
                    onClick={() => {
                      if (!entry.path) return;
                      setCodeFile(entry.path);
                      setPanel("code");
                    }}
                  >
                    <span className="console-kind">{entry.ok ? "✓" : "!"}</span>
                    <span>{entry.message}</span>
                    {entry.path ? <code>{entry.path}</code> : null}
                  </button>
                ))
              )}
            </div>
          ) : null}

          {panel === "assets" ? (
            <div className="assets-panel">
              {assetGroups.length === 0 ? (
                <p className="panel-empty">
                  No assets yet. Generated HTML, CSS and JS files appear here by type.
                </p>
              ) : (
                <div className="asset-grid">
                  {assetGroups.map(([ext, group]) => (
                    <div className="asset-card" key={ext}>
                      <span className="asset-ext">.{ext}</span>
                      <strong>
                        {group.count} file{group.count === 1 ? "" : "s"}
                      </strong>
                      <span>{formatSize(group.bytes)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {panel === "history" ? (
            <div className="history-panel">
              {messages.length === 0 ? (
                <p className="panel-empty">The conversation timeline appears here.</p>
              ) : (
                messages.map((message, index) => (
                  <div className={`history-row ${message.role}`} key={`history-${index}`}>
                    <span className="history-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="history-body">
                      <strong>{message.role === "user" ? "You" : "Cygnus"}</strong>
                      <p>
                        {message.content
                          ? message.content.length > 220
                            ? `${message.content.slice(0, 220)}…`
                            : message.content
                          : (message.error ??
                            (message.tools?.length
                              ? `${message.tools.length} file operation${
                                  message.tools.length === 1 ? "" : "s"
                                }`
                              : "No text"))}
                      </p>
                    </div>
                    {message.tools?.length ? (
                      <span className="history-tools">{message.tools.length} ops</span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : null}

          {panel === "settings" ? (
            <div className="settings-panel">
              <div className="settings-row">
                <span>Provider</span>
                <strong>{providerLabel(provider)}</strong>
              </div>
              <div className="settings-row">
                <span>Model</span>
                <strong>{provider.model}</strong>
              </div>
              <div className="settings-row">
                <span>Endpoint</span>
                <strong>
                  {isDemo(provider) ? "Built-in demo" : endpointHost(provider.baseUrl)}
                </strong>
              </div>
              <div className="settings-row">
                <span>Access</span>
                <strong>{isKeylessProvider(provider) ? "No key" : "Key in this browser"}</strong>
              </div>
              <div className="settings-row">
                <span>Project</span>
                <strong>{project?.name ?? projectId}</strong>
              </div>
              <div className="settings-row">
                <span>Files</span>
                <strong>{files.length}</strong>
              </div>
              <div className="settings-github">
                <div className="settings-row">
                  <span>GitHub repo</span>
                  <strong>
                    {project?.github
                      ? `${project.github.repo} · ${project.github.branch}`
                      : "Not linked"}
                  </strong>
                </div>
                {project?.github ? null : (
                  <input
                    className="settings-input"
                    value={repoDraft}
                    onChange={(event) => setRepoDraft(event.target.value)}
                    placeholder="owner/repo "
                    aria-label="GitHub repository"
                    spellCheck={false}
                  />
                )}
                <div className="settings-actions">
                  <button
                    type="button"
                    onClick={() => void pushToGithub()}
                    disabled={push.busy || (!project?.github && !repoDraft.trim())}
                  >
                    {push.busy ? "Pushing…" : project?.github ? "Push to GitHub" : "Link & push"}
                  </button>
                  <button type="button" onClick={() => router.push("/settings#github")}>
                    GitHub settings
                  </button>
                </div>
                {push.error ? <p className="settings-note warn">{push.error}</p> : null}
                {push.result ? <p className="settings-note">{push.result}</p> : null}
              </div>

              <div className="settings-actions">
                <button type="button" onClick={() => router.push("/settings")}>
                  Manage models
                </button>
                <button type="button" onClick={() => setRelease((value) => value + 1)}>
                  Reload preview
                </button>
                <a
                  href={`/api/preview/${projectId}/index.html`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open app ↗
                </a>
              </div>
              <p className="settings-note">
                Keys never leave this browser. Generated files live in the project folder on this
                machine.
              </p>
              <div className="settings-danger">
                <div>
                  <strong>Delete this project</strong>
                  <span>Removes its files and chat from this computer.</span>
                </div>
                <button type="button" className="danger-btn" onClick={() => void removeProject()}>
                  {deleteArmed ? "Click again to confirm" : "Delete"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      <footer className="builder-status">
        <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
        <span>{providerLabel(provider)}</span>
        <span className="status-sep" />
        <span className="status-model">{provider.model}</span>
        <span className="status-sep" />
        <span>{files.length} files</span>
        <span className="status-right">
          {isKeylessProvider(provider)
            ? isDemo(provider)
              ? "Demo · no key"
              : isHosted(provider)
                ? "Hosted · no key"
                : isCygnusLocalProvider(provider)
                  ? "On-device · experimental"
                  : isLocalEndpoint(provider.baseUrl)
                  ? "Local · no key"
                  : "Free · no key"
            : "Cloud · key"}
        </span>
      </footer>

      {publishOpen ? (
        <PublishPanel
          projectId={projectId}
          published={project?.publish ?? null}
          onClose={() => setPublishOpen(false)}
          onPublished={async () => {
            await refresh().catch(() => undefined);
          }}
        />
      ) : null}

      <CommandPalette
        open={paletteOpen}
        actions={paletteActions}
        onClose={() => setPaletteOpen(false)}
      />

      {studioOpen ? (
        <StudioPanel
          projectId={projectId}
          files={files}
          initialTab={studioTab}
          onClose={() => setStudioOpen(false)}
          onChanged={async () => {
            await refresh().catch(() => undefined);
            setRelease((value) => value + 1);
          }}
          onPrompt={insertPrompt}
          onAction={runMoveAction}
        />
      ) : null}

      <FileDrawer
        files={files}
        open={filesOpen}
        initialPath={drawerFile}
        onClose={() => {
          setFilesOpen(false);
          setDrawerFile(null);
        }}
      />
    </div>
  );
}

function AskCard({
  ask,
  onAnswer,
}: {
  ask: AskPrompt;
  onAnswer: (answer: string) => void;
}) {
  const [value, setValue] = useState("");
  const pending = ask.status === "pending";

  function submit(answer: string) {
    const text = answer.trim();
    if (!text || !pending) return;
    onAnswer(text);
  }

  return (
    <div className={`ask-card ${ask.status}`}>
      <div className="ask-head">
        <span>Needs your call</span>
        <em>{pending ? "Waiting" : ask.status === "answered" ? "Answered" : "Cancelled"}</em>
      </div>
      <p className="ask-question">{ask.question}</p>
      {ask.options && ask.options.length > 0 ? (
        <div className="ask-options">
          {ask.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!pending}
              onClick={() => submit(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
      {pending && ask.allowFreeText !== false ? (
        <form
          className="ask-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit(value);
            setValue("");
          }}
        >
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Type your answer…"
            aria-label="Your answer"
            autoFocus
          />
          <button type="submit" disabled={!value.trim()}>
            Send
          </button>
        </form>
      ) : null}
      {ask.status === "answered" && ask.answer ? (
        <p className="ask-answer">You answered: {ask.answer}</p>
      ) : null}
      {ask.status === "cancelled" ? (
        <p className="ask-answer">Question cancelled.</p>
      ) : null}
      {ask.error ? <p className="ask-error">{ask.error}</p> : null}
    </div>
  );
}

function BlueprintCard({ tasks }: { tasks: BlueprintTask[] }) {
  const done = tasks.filter((task) => task.status === "done").length;
  return (
    <div className="blueprint-card">
      <div className="blueprint-head">
        <span>Blueprint</span>
        <em>
          {done}/{tasks.length} done
        </em>
      </div>
      <ul className="blueprint-list">
        {tasks.map((task) => (
          <li className={`blueprint-item ${task.status}`} key={task.id}>
            <span className="blueprint-mark" aria-hidden="true">
              {task.status === "done" ? "✓" : task.status === "active" ? "▸" : "○"}
            </span>
            <span>{task.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function useElapsed(startedAt?: string, endedAt?: string, live?: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const end = endedAt ? new Date(endedAt).getTime() : live ? now : start;
  return Math.max(0, (end - start) / 1000);
}

function Narration({
  events,
  activity,
  content,
  live,
  startedAt,
  endedAt,
  onOpen,
}: {
  events: ChatEvent[];
  activity?: string;
  content: string;
  live: boolean;
  startedAt?: string;
  endedAt?: string;
  onOpen: (path: string) => void;
}) {
  const steps: ToolEvent[] = [];
  let narration = "";
  // Text after the last tool call is the closing answer; earlier text is
  // checkpoint narration and stays out of the final transcript.
  let closing = "";
  for (const event of events) {
    if (event.type === "tool") {
      steps.push(event.tool);
      closing = "";
    } else {
      narration += event.text;
      closing += event.text;
    }
  }
  narration = narration.replace(/\s+/g, " ").trim();
  closing = closing.trim();
  const elapsed = useElapsed(startedAt, endedAt, live);

  // Freebuff shape while a turn runs: a live status line and the ordered
  // stream (text as it is written, tool rows as they finish). Nothing is held
  // back until the turn ends.
  if (live) {
    const last = events[events.length - 1];
    const line =
      activity ||
      (last?.type === "tool" ? last.tool.message : "") ||
      "Working\u2026";
    return (
      <div className="narration live">
        <p className="narration-line" role="status">
          <span className="narration-dot" aria-hidden="true" />
          <span>{line}</span>
          {elapsed !== null ? (
            <span className="narration-time">{formatDuration(elapsed)}</span>
          ) : null}
        </p>
        <div className="narration-live">
          {events.map((event, index) =>
            event.type === "text" ? (
              event.text.trim() ? (
                <div className="bubble assistant-bubble narration-text" key={`text-${index}`}>
                  {event.text}
                </div>
              ) : null
            ) : (
              <ToolLine
                key={`tool-${index}`}
                tool={event.tool}
                onOpen={() => {
                  if (event.tool.path) onOpen(event.tool.path);
                }}
              />
            ),
          )}
        </div>
      </div>
    );
  }

  const reply = content.trim() ? closing || content.trim() : closing || narration;
  return (
    <div className="narration">
      {steps.length > 0 ? (
        <details className="narration-steps">
          <summary>
            <span>Worked{elapsed !== null ? ` for ${formatDuration(elapsed)}` : ""}</span>
            <em>
              {steps.length} step{steps.length === 1 ? "" : "s"}
            </em>
          </summary>
          <div className="narration-rows">
            {steps.map((tool, toolIndex) => (
              <ToolLine
                key={`${tool.name}-${toolIndex}`}
                tool={tool}
                onOpen={() => {
                  if (tool.path) onOpen(tool.path);
                }}
              />
            ))}
          </div>
        </details>
      ) : null}
      {reply ? <div className="bubble assistant-bubble">{reply}</div> : null}
    </div>
  );
}

function ToolLine({ tool, onOpen }: { tool: ToolEvent; onOpen: () => void }) {
  const label = tool.message || tool.name;
  return (
    <button
      type="button"
      className={`tool-line ${tool.ok ? "ok" : "warn"}`}
      onClick={onOpen}
      disabled={!tool.path}
      title={tool.detail ?? tool.path ?? label}
    >
      <span className="tool-line-icon" aria-hidden="true">
        {tool.ok ? "✓" : "!"}
      </span>
      <span className="tool-line-text">{label}</span>
      {tool.path ? <code>{tool.path}</code> : null}
    </button>
  );
}

function ThinkingBlock({
  nodes,
  activities,
  live,
  startedAt,
  endedAt,
}: {
  nodes: ReasoningNode[];
  activities: string[];
  live: boolean;
  startedAt?: string;
  endedAt?: string;
}) {
  const elapsed = useElapsed(startedAt, endedAt, live);
  const tail = nodes[nodes.length - 1]?.text ?? activities[activities.length - 1] ?? "";
  const preview = live ? tail.replace(/\s+/g, " ").trim().slice(-90) : "";
  const title = live
    ? "Thinking\u2026"
    : elapsed !== null
      ? `Thought for ${formatDuration(elapsed)}`
      : "Thoughts";
  const log = activities.filter(Boolean);

  return (
    <details className={`thinking-block reasoning-block ${live ? "live" : ""}`}>
      <summary aria-label={live ? "Open the model's live thinking" : "Open the model's thoughts"}>
        <span className="reasoning-title">
          {live ? <i className="reasoning-pulse" aria-hidden="true" /> : null}
          {title}
        </span>
        {preview ? <span className="reasoning-preview">{preview}</span> : null}
        <span className="thinking-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="thinking-body">
        {nodes.length === 0 ? (
          <p className="thinking-empty">
            {live
              ? "This model does not stream a private thought channel. Its live progress is below."
              : "This model did not return a separate thought stream."}
          </p>
        ) : null}
        <div className="reasoning-list">
          {nodes.map((node, index) => {
            const label = node.label ?? (node.depth === 0 ? "Thinking" : `Layer ${node.depth}`);
            if (node.depth === 0) {
              return (
                <div className="reasoning-node" key={`${node.depth}-${index}`}>
                  <span className="reasoning-depth">{label}</span>
                  <p>{node.text}</p>
                </div>
              );
            }
            return (
              <details
                className="reasoning-node nested"
                key={`${node.depth}-${index}`}
                style={{ marginLeft: Math.min(node.depth, 8) * 12 }}
              >
                <summary>
                  <span className="reasoning-depth">{label}</span>
                  <span className="reasoning-peek">
                    {node.text.replace(/\s+/g, " ").trim().slice(0, 110)}
                  </span>
                </summary>
                <p>{node.text}</p>
              </details>
            );
          })}
        </div>
        {log.length > 0 ? (
          <div className="thinking-log">
            <span className="thinking-log-title">Steps</span>
            {log.map((line, index) => (
              <span className="thinking-log-row" key={`${line}-${index}`}>
                <i aria-hidden="true" />
                {line}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function AgentRuns({ runs }: { runs: AgentRun[] }) {
  return (
    <div className="agent-list">
      {runs.map((run) => (
        <details className={`agent-row ${run.status}`} key={run.id}>
          <summary>
            <span className="agent-dot" aria-hidden="true" />
            <strong>{AGENT_LABELS[run.agent] ?? run.agent}</strong>
            <span className="agent-task">{run.task}</span>
            <em>{run.status}</em>
          </summary>
          {run.summary ? <p className="agent-summary">{run.summary}</p> : null}
        </details>
      ))}
    </div>
  );
}
