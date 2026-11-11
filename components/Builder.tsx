"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppShell } from "@/components/AppShell";
import FileDrawer from "@/components/FileDrawer";
import ModelMenu from "@/components/ModelMenu";
import { useProvider } from "@/components/ProviderContext";
import { endpointHost, isLocalEndpoint } from "@/lib/endpoints";
import { isDemo, isKeylessProvider, providerLabel } from "@/lib/providers";
import type { ChatMessage, ProjectData, ToolEvent } from "@/lib/types";

type PanelId =
  | "preview"
  | "code"
  | "files"
  | "changes"
  | "assets"
  | "console"
  | "history"
  | "settings";

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

export default function Builder({
  projectId,
  initialPrompt,
}: {
  projectId: string;
  initialPrompt: string | null;
}) {
  const { provider, openSettings } = useProvider();
  const { openSidebar } = useAppShell();
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

  const abortRef = useRef<AbortController | null>(null);
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
    setMessages(data.chat ?? []);
    return data;
  }, [projectId]);

  useEffect(() => {
    refresh().catch((error: Error) => setLoadError(error.message));
  }, [refresh]);

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, atBottom]);

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
      { role: "assistant", content: "", tools: [] },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: text, provider: config }),
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
        if (event.type === "text" && typeof event.value === "string") {
          const delta = event.value;
          setMessages((previous) =>
            updateLast(previous, (message) => ({ ...message, content: message.content + delta })),
          );
          return;
        }
        if (event.type === "tool") {
          const tool: ToolEvent = {
            name: String(event.name ?? "tool"),
            ok: Boolean(event.ok),
            path: typeof event.path === "string" ? event.path : undefined,
            message: String(event.message ?? "Done"),
          };
          setMessages((previous) =>
            updateLast(previous, (message) => ({
              ...message,
              tools: [...(message.tools ?? []), tool],
            })),
          );
          return;
        }
        if (event.type === "error") {
          const detail = String(event.message ?? "Something went wrong.");
          setMessages((previous) =>
            updateLast(previous, (message) => ({ ...message, error: detail })),
          );
          return;
        }
        if (event.type === "done") {
          if (event.truncated) {
            setMessages((previous) =>
              updateLast(previous, (message) => ({
                ...message,
                content:
                  (message.content ? `${message.content}\n\n` : "") +
                  "Stopped after 10 tool rounds — ask me to continue.",
              })),
            );
          }
          setRelease((value) => value + 1);
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
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  useEffect(() => {
    if (!project || !initialPrompt || autoSent.current) return;
    autoSent.current = true;
    setMobileView("chat");
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

  const files = project?.files ?? [];
  const busy = streaming;
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

  return (
    <div className="builder">
      <header className="builder-bar">
        <div className="builder-bar-left">
          <button
            type="button"
            className="menu-btn"
            onClick={openSidebar}
            aria-label="Open projects"
          >
            ☰
          </button>
          <div className="project-title">
            <strong>{project?.name ?? "Workspace"}</strong>
          </div>
        </div>

        <div className="builder-bar-right">
          <div className="mobile-switch">
            <button
              type="button"
              className={mobileView === "chat" ? "active" : ""}
              onClick={() => setMobileView("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              className={mobileView === "preview" ? "active" : ""}
              onClick={() => setMobileView("preview")}
            >
              Preview
            </button>
          </div>

          <button type="button" className="ghost-btn" onClick={() => setPanel("files")}>
            Files
          </button>
          <button type="button" className="model-pill" onClick={openSettings}>
            <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
            <span className="pill-label">{providerLabel(provider)}</span>
          </button>
        </div>
      </header>

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
                <h2>What are we building?</h2>
                <p>Describe it below. Changes show up in the preview.</p>
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
                  {message.content ? (
                    <div className="bubble assistant-bubble">{message.content}</div>
                  ) : null}
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
                  {message.tools && message.tools.length > 0 ? (
                    <div className="tool-list">
                      {message.tools.map((tool, toolIndex) => (
                        <button
                          type="button"
                          className={`tool-chip ${tool.ok ? "ok" : "warn"}`}
                          key={`${tool.name}-${toolIndex}`}
                          disabled={!tool.path}
                          title={tool.path ? `Open ${tool.path}` : tool.message}
                          onClick={() => {
                            if (!tool.path) return;
                            setDrawerFile(tool.path);
                            setFilesOpen(true);
                          }}
                        >
                          <span aria-hidden="true">{tool.ok ? "✓" : "!"}</span>
                          <span>{tool.message}</span>
                          {tool.path ? <code>{tool.path}</code> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.error ? (
                    <div className="error-card">
                      <strong>That didn&apos;t work</strong>
                      <p>{message.error}</p>
                      <p className="hint">
                        Check the model settings, the API key, and that the provider supports tool
                        calling. Local servers must be running.
                      </p>
                    </div>
                  ) : null}
                  {!message.content &&
                  !message.error &&
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
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder="Describe a change, or ask for something new…"
              aria-label="Message Cygnus"
            />
            <div className="composer-row">
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
                      openSettings();
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
            <p className="composer-hint">
              Enter to send · Shift+Enter for a new line · {provider.model} ·{" "}
              {isKeylessProvider(provider) ? "no key" : "key saved"}
            </p>
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
          <div className="preview-bar">
            <div className="panel-tabs" role="tablist" aria-label="Workspace panels">
              {(
                [
                  ["preview", "Preview"],
                  ["code", "Code"],
                  ["files", "Files"],
                  ["changes", "Changes"],
                  ["assets", "Assets"],
                  ["console", "Console"],
                  ["history", "History"],
                  ["settings", "Setup"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={panel === id}
                  className={panel === id ? "active" : ""}
                  onClick={() => setPanel(id)}
                >
                  {label}
                </button>
              ))}
            </div>
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
              {busy ? <div className="preview-building">Building…</div> : null}
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
              <div className="settings-actions">
                <button type="button" onClick={openSettings}>
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
              : isLocalEndpoint(provider.baseUrl)
                ? "Local · no key"
                : "Free · no key"
            : "Cloud · key"}{" "}
          · {panel}
        </span>
      </footer>

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
