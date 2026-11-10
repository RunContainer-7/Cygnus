"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAppShell } from "@/components/AppShell";
import ConstellationBackground from "@/components/ConstellationBackground";
import { useProvider } from "@/components/ProviderContext";
import { isDemo, providerLabel } from "@/lib/providers";

type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
};

export default function HomePage() {
  const router = useRouter();
  const { provider, openSettings } = useProvider();
  const { openSidebar } = useAppShell();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
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
          <span>Start a new app or open one you already built</span>
        </div>
        <div className="home-bar-actions">
          <button type="button" className="ghost-btn" onClick={openSettings}>
            Model settings
          </button>
        </div>
      </header>

      <div className="home-body">
        <section className="hero">
          <h1>What should we build?</h1>
          <p className="home-sub">
            Describe an app in plain language. Cygnus writes the code, previews it live, and keeps
            iterating with you.
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
              <button type="button" className="model-chip" onClick={openSettings}>
                <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
                {isDemo(provider) ? "Offline demo" : providerLabel(provider)}
              </button>
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
                  Offline demo — it writes a sample app.{" "}
                  <button type="button" className="link-btn" onClick={openSettings}>
                    Connect a model
                  </button>{" "}
                  to build what you ask for. Enter builds, Shift+Enter adds a line.
                </>
              ) : (
                <>
                  Using {providerLabel(provider)} with your key. Keys stay in this browser.
                  Enter builds, Shift+Enter adds a line.
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
        </section>

        {projects.length > 0 ? (
          <section className="apps">
            <div className="apps-head">
              <h2>Your apps</h2>
              <span>
                {projects.length} {projects.length === 1 ? "project" : "projects"}
              </span>
            </div>
            <div className="apps-grid">
              {projects.map((project) => (
                <Link key={project.id} href={`/build/${project.id}`} className="app-card">
                  <strong>{project.name}</strong>
                  <span>Opened {new Date(project.createdAt).toLocaleDateString()}</span>
                </Link>
              ))}
              <button
                type="button"
                className="app-card app-card-new"
                onClick={() => promptRef.current?.focus()}
              >
                + New app
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
