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

const TEMPLATES = [
  {
    title: "Landing page",
    blurb: "Hero, features and pricing for a product launch.",
    prompt: "A landing page for a coffee subscription with a hero, features and pricing",
    glyph: "◇",
    tone: "indigo",
  },
  {
    title: "Kanban board",
    blurb: "Columns, cards and local task persistence.",
    prompt: "A kanban task board with todo, doing and done columns",
    glyph: "▦",
    tone: "green",
  },
  {
    title: "Finance dashboard",
    blurb: "Charts, budgets and a transaction list.",
    prompt: "A personal finance dashboard with charts, a budget and transactions",
    glyph: "◔",
    tone: "amber",
  },
];

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "A";
}

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

  function useTemplate(value: string) {
    setPrompt(value);
    promptRef.current?.focus();
  }

  const keyless = isKeylessProvider(provider);
  const access = isDemo(provider) ? "Demo" : keyless ? "No key" : "API key";

  return (
    <div className="home">
      <ConstellationBackground />
      <div className="home-glow" aria-hidden="true" />

      <header className="home-bar">
        <button type="button" className="menu-btn" onClick={openSidebar} aria-label="Open projects">
          ☰
        </button>
        <div className="home-bar-title">
          <h2>Workspace</h2>
          <span>Build and manage your apps</span>
        </div>
        <div className="home-bar-actions">
          <button type="button" className="ghost-btn" onClick={openSettings}>
            Model settings
          </button>
        </div>
      </header>

      <div className="home-canvas">
        <section className="build-card">
          <div className="build-head">
            <div>
              <span className="kicker">New app</span>
              <h1>What should we build?</h1>
              <p className="build-sub">
                Describe it in plain language. Cygnus writes the files and previews the app live.
              </p>
            </div>
            <span className="build-mode">
              <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
              {access}
            </span>
          </div>

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
                    placement="down"
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
              {isDemo(provider)
                ? "Demo mode writes a sample app. Pick a model for real builds."
                : keyless
                  ? `No API key needed with ${providerLabel(provider)}.`
                  : `Using ${providerLabel(provider)} with a key stored in this browser.`}{" "}
              Enter builds, Shift+Enter adds a line.
            </p>
          </div>

          <div className="prompt-chips">
            {[
              "A landing page for a coffee subscription",
              "A kanban task board",
              "A personal finance dashboard",
            ].map((idea) => (
              <button key={idea} type="button" onClick={() => useTemplate(idea)}>
                {idea}
              </button>
            ))}
          </div>

          {error ? <p className="form-error">{error}</p> : null}
        </section>

        <section className="section-card recent-card">
            <div className="section-head">
              <div>
                <h2>Recent projects</h2>
                <p>Continue where you left off</p>
              </div>
              <div className="section-tools">
                <span>
                  {projects.length} {projects.length === 1 ? "project" : "projects"}
                </span>
                <button
                  type="button"
                  className="section-action"
                  onClick={() => promptRef.current?.focus()}
                >
                  + New
                </button>
              </div>
            </div>

            <div className="project-entries">
              {projects.map((project, index) => (
                <Link key={project.id} href={`/build/${project.id}`} className="project-entry">
                  <span className={`project-badge thumb-${index % 3}`}>
                    {initials(project.name)}
                  </span>
                  <span className="project-entry-main">
                    <strong>{project.name}</strong>
                    <span>
                      {project.fileCount ?? 0} files ·{" "}
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="project-entry-open">Open →</span>
                </Link>
              ))}

              {projects.length === 0 ? (
                <button
                  type="button"
                  className="project-entry project-entry-empty"
                  onClick={() => promptRef.current?.focus()}
                >
                  <span className="project-badge">+</span>
                  <span className="project-entry-main">
                    <strong>Start a new app</strong>
                    <span>Describe it in the prompt above</span>
                  </span>
                </button>
              ) : null}
            </div>
          </section>


        <section className="templates-block">
          <div className="section-head">
            <div>
              <h2>Templates</h2>
              <p>Start from a shape, then change everything</p>
            </div>
          </div>
          <div className="template-grid">
            {TEMPLATES.map((template) => (
              <button
                key={template.title}
                type="button"
                className="template-card"
                onClick={() => useTemplate(template.prompt)}
              >
                <span className={`template-icon ${template.tone}`}>{template.glyph}</span>
                <strong>{template.title}</strong>
                <p>{template.blurb}</p>
                <span className="template-use">Use template →</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
