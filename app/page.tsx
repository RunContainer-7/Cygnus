"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConstellationBackground from "@/components/ConstellationBackground";
import Icon from "@/components/Icon";
import ModelMenu from "@/components/ModelMenu";
import { useProvider } from "@/components/ProviderContext";
import TemplateCard from "@/components/TemplateCard";
import { isDemo, providerLabel } from "@/lib/providers";
import { TEMPLATES } from "@/lib/templates";

const EXAMPLES = [
  "A landing page for a coffee subscription",
  "A kanban task board with local persistence",
  "A personal finance dashboard",
];

export default function HomePage() {
  const router = useRouter();
  const { provider } = useProvider();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get("prompt");
    if (!incoming) return;
    setPrompt(incoming);
    window.history.replaceState(null, "", window.location.pathname);
    window.setTimeout(() => promptRef.current?.focus(), 120);
  }, []);

  async function start() {
    const text = prompt.trim();
    if (!text || creating) return;
    setCreating(true);
    setError(null);
    setModelMenuOpen(false);
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
    document.querySelector(".home-v2")?.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => promptRef.current?.focus(), 180);
  }

  const featured = TEMPLATES.filter((template) => template.featured).slice(0, 3);
  const demo = isDemo(provider);

  return (
    <div className="home-v2">
      <ConstellationBackground />
      <div className="home-aurora" aria-hidden="true" />

      <div className="home-inner">
        <section className="home-hero">
          <span className="home-eyebrow">
            <span className="home-eyebrow-dot" />
            Open models. Local files. No lock-in.
          </span>
          <h1>What do you want to build?</h1>
          <p className="home-sub">
            Describe the app in plain language. Cygnus writes real files, runs the preview,
            and keeps every project on your machine.
          </p>

          <form
            className="hero-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void start();
            }}
          >
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
              rows={3}
              placeholder="Ask Cygnus to build…"
              aria-label="Describe the app you want to build"
            />

            <div className="hero-composer-bar">
              <div className="hero-composer-tools">
                <span className="hero-build-mode">
                  <Icon name="sparkles" size={14} />
                  Build
                </span>
                <span className="hero-tool-divider" aria-hidden="true" />
                <div className="hero-model-wrap">
                  <button
                    type="button"
                    className="hero-model-trigger"
                    aria-expanded={modelMenuOpen}
                    aria-haspopup="dialog"
                    onClick={() => setModelMenuOpen((value) => !value)}
                  >
                    <span className={`status-dot ${demo ? "demo" : "live"}`} />
                    <span className="hero-model-prefix">Model</span>
                    <strong>{providerLabel(provider)}</strong>
                    <Icon name="chevronDown" size={13} />
                  </button>
                  {modelMenuOpen ? (
                    <ModelMenu
                      onClose={() => setModelMenuOpen(false)}
                      onManage={() => router.push("/settings")}
                    />
                  ) : null}
                </div>
              </div>

              <button
                type="submit"
                className="hero-send"
                disabled={!prompt.trim() || creating}
                aria-label={creating ? "Creating workspace" : "Build this app"}
              >
                <Icon name="send" size={17} />
              </button>
            </div>
          </form>

          <p className="hero-composer-note">
            {demo
              ? "Offline demo is selected. Pick an open model for real builds."
              : `${provider.model} · ${providerLabel(provider)}`}
            <span>Enter to build · Shift+Enter for a new line</span>
          </p>

          {error ? <p className="hero-error">{error}</p> : null}

          <div className="example-row">
            <span className="example-label">Try</span>
            {EXAMPLES.map((idea) => (
              <button key={idea} type="button" onClick={() => useTemplate(idea)}>
                {idea}
              </button>
            ))}
          </div>

          <div className="home-quicklinks">
            <Link href="/templates">
              Browse templates <Icon name="arrowUpRight" size={13} />
            </Link>
            <Link href="/plugins">
              Local model runtimes <Icon name="arrowUpRight" size={13} />
            </Link>
          </div>
        </section>

        <section className="home-featured">
          <div className="home-section-head">
            <div>
              <span className="home-section-eyebrow">Curated starts</span>
              <h2>Start with a shape</h2>
            </div>
            <Link href="/templates" className="home-section-link">
              All templates <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          <div className="home-featured-grid">
            {featured.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={() => useTemplate(template.prompt)}
              />
            ))}
          </div>
        </section>

        <footer className="home-footer">
          <span>MIT licensed · local-first</span>
          <span>{new Date().getFullYear()} · Cygnus</span>
        </footer>
      </div>
    </div>
  );
}
