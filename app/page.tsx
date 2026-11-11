"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAppShell } from "@/components/AppShell";
import ConstellationBackground from "@/components/ConstellationBackground";
import ModelMenu from "@/components/ModelMenu";
import { useProvider } from "@/components/ProviderContext";
import { isDemo, isKeylessProvider, providerLabel } from "@/lib/providers";

type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  fileCount?: number;
};

const PANELS = [
  "Preview",
  "Code",
  "Files",
  "Changes",
  "Assets",
  "Console",
  "History",
  "Setup",
];

export default function HomePage() {
  const router = useRouter();
  const { provider, openSettings } = useProvider();
  const { openSidebar } = useAppShell();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((data: { projects?: ProjectSummary[] }) => {
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    const text = prompt.trim();
    if (!text || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: text.slice(0, 60) }),
      });
      if (!response.ok) throw new Error("Could not create a workspace.");
      const data = (await response.json()) as { id: string };
      router.push(`/build/${data.id}?prompt=${encodeURIComponent(text)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setCreating(false);
    }
  }

  const keyless = isKeylessProvider(provider);
  const accessLabel = isDemo(provider)
    ? "Offline demo"
    : keyless
      ? "No key needed"
      : "API key saved";

  return (
    <div className="home">
      <ConstellationBackground />
      <div className="home-glow" aria-hidden="true" />

      <header className="home-bar">
        <button type="button" className="menu-btn" onClick={openSidebar} aria-label="Open projects">
          ☰
        </button>
        <div className="home-bar-title">
          <h2>Home</h2>
          <span>Start a build, connect a model, or pick up a project</span>
        </div>
        <div className="home-bar-actions">
          <button type="button" className="ghost-btn" onClick={openSettings}>
            Model settings
          </button>
        </div>
      </header>

      <div className="home-dash">
        <section className="dash-main">
          <div className="dash-hero">
            <span className="dash-eyebrow">New build</span>
            <h1>What should we build?</h1>
            <p className="home-sub">
              Describe an app in plain language. Cygnus writes real files, previews them live, and
              iterates with you — with a hosted model or one running on this machine.
            </p>

            <div className="composer">
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void start();
                  }
                }}
                rows={4}
                placeholder="A landing page for a coffee subscription…"
                aria-label="Describe the app you want to build"
              />
              <div className="composer-row">
                <div className="composer-model-wrap">
                  <button
                    type="button"
                    className="model-chip"
                    aria-expanded={modelMenuOpen}
                    aria-haspopup="dialog"
                    onClick={() => setModelMenuOpen((value) => !value)}
                  >
                    <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
                    {providerLabel(provider)}
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
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void start()}
                  disabled={!prompt.trim() || creating}
                >
                  {creating ? "Starting…" : "Build"}
                </button>
              </div>
              <p className="composer-note">
                {isDemo(provider) ? (
                  <>
                    Offline demo writes a sample app. Pick a no-key model in the picker above to
                    build what you ask for. Enter builds, Shift+Enter adds a line.
                  </>
                ) : keyless ? (
                  <>
                    No API key needed with {providerLabel(provider)}. Enter builds, Shift+Enter adds
                    a line.
                  </>
                ) : (
                  <>
                    Using {providerLabel(provider)} with your key. Keys stay in this browser. Enter
                    builds, Shift+Enter adds a line.
                  </>
                )}
              </p>
            </div>

            <div className="prompt-chips">
              {[
                "A landing page for a coffee subscription",
                "A kanban task board",
                "A personal finance dashboard",
              ].map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => {
                    setPrompt(idea);
                    promptRef.current?.focus();
                  }}
                >
                  {idea}
                </button>
              ))}
            </div>

            {error ? <p className="form-error">{error}</p> : null}
          </div>

          <div className="dash-metrics">
            <div className="dash-metric">
              <span>Active model</span>
              <strong>{providerLabel(provider)}</strong>
              <em>{isDemo(provider) ? "offline" : provider.model}</em>
            </div>
            <div className="dash-metric">
              <span>Access</span>
              <strong>{accessLabel}</strong>
              <em>{keyless ? "nothing to paste" : "stored locally"}</em>
            </div>
            <div className="dash-metric">
              <span>Projects</span>
              <strong>{projects.length}</strong>
              <em>{projects.length === 1 ? "saved app" : "saved apps"}</em>
            </div>
            <div className="dash-metric">
              <span>Workspace</span>
              <strong>{PANELS.length} panels</strong>
              <em>chat + live app</em>
            </div>
          </div>

          <section className="dash-block">
            <div className="dash-block-head">
              <h2>Your apps</h2>
              <span>{projects.length === 0 ? "Nothing yet" : `${projects.length} total`}</span>
            </div>
            {projects.length > 0 ? (
              <div className="project-list">
                {projects.map((project) => (
                  <Link key={project.id} href={`/build/${project.id}`} className="project-row">
                    <span className="project-mark" aria-hidden="true">
                      ◇
                    </span>
                    <span className="project-main">
                      <strong>{project.name}</strong>
                      <span>
                        {project.fileCount ?? 0} files ·{" "}
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="project-open">Open →</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dash-empty">
                <p>No projects yet. Your first prompt creates one here.</p>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => promptRef.current?.focus()}
                >
                  Start a build
                </button>
              </div>
            )}
          </section>

          <div className="dash-grid">
            <section className="dash-card">
              <h3>Start without a key</h3>
              <p>
                Keyless means local: run Ollama or LM Studio, point Cygnus at its endpoint, and no
                account, key, or request ever leaves this machine.
              </p>
              <div className="dash-actions">
                <button type="button" onClick={openSettings}>
                  Choose a model
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt("A pomodoro timer with focus and break sessions");
                    promptRef.current?.focus();
                  }}
                >
                  Use a starter prompt
                </button>
              </div>
            </section>
            <section className="dash-card">
              <h3>Workspace panels</h3>
              <div className="panel-list">
                {PANELS.map((panel) => (
                  <span key={panel}>{panel}</span>
                ))}
              </div>
            </section>
          </div>
        </section>

        <aside className="dash-rail">
          <article className="rail-card">
            <div className="rail-head">
              <h3>Active model</h3>
              <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
            </div>
            <strong>{providerLabel(provider)}</strong>
            <p className="rail-mono">{isDemo(provider) ? "cygnus-demo" : provider.model}</p>
            <button type="button" className="panel-link" onClick={openSettings}>
              Change model →
            </button>
          </article>

          <article className="rail-card">
            <h3>No key required</h3>
            <ul className="rail-list">
              <li>
                <span>Ollama · localhost:11434</span>
                <em>local</em>
              </li>
              <li>
                <span>LM Studio · localhost:1234</span>
                <em>local</em>
              </li>
              <li>
                <span>Respan Gateway · localhost:8787</span>
                <em>local</em>
              </li>
            </ul>
            <button type="button" className="panel-link" onClick={openSettings}>
              Set up keyless →
            </button>
          </article>

          <article className="rail-card">
            <h3>Workspace</h3>
            <div className="rail-stat">
              <span>Apps</span>
              <strong>{projects.length}</strong>
            </div>
            <div className="rail-stat">
              <span>Panels</span>
              <strong>{PANELS.length}</strong>
            </div>
            <div className="rail-stat">
              <span>Keys</span>
              <strong>Browser only</strong>
            </div>
          </article>

          <article className="rail-card">
            <h3>Quick actions</h3>
            <div className="rail-actions">
              <button type="button" onClick={() => promptRef.current?.focus()}>
                New build
              </button>
              <button type="button" onClick={openSettings}>
                Model settings
              </button>
              <a
                href="https://github.com/RunContainer-7/Cygnus"
                target="_blank"
                rel="noreferrer"
              >
                GitHub ↗
              </a>
            </div>
          </article>

          <article className="rail-card rail-tip">
            <h3>Why keys exist</h3>
            <p>
              Hosted open-source APIs like Groq and Together each need their own key. Freebuff can
              hide that because it proxies models through its servers; Cygnus has no proxy, so
              keyless means a model running on your own machine.
            </p>
          </article>
        </aside>
      </div>
    </div>
  );
}
