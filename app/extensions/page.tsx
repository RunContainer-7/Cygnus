"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import {
  EXTENSION_CATEGORIES,
  type BuildExtension,
  type ExtensionCategory,
} from "@/lib/extensions";

type ExtensionsPayload = {
  extensions?: BuildExtension[];
  installed?: string[];
  error?: string;
};

type CategoryFilter = "All" | ExtensionCategory;

const ALL_CATEGORIES: CategoryFilter[] = ["All", ...EXTENSION_CATEGORIES];

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState<BuildExtension[]>([]);
  const [installed, setInstalled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [onlyInstalled, setOnlyInstalled] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extensions", { cache: "no-store" });
      const data = (await response.json()) as ExtensionsPayload;
      if (!response.ok || !Array.isArray(data.extensions)) {
        throw new Error(data.error || "Could not load extensions.");
      }
      setExtensions(data.extensions);
      setInstalled(Array.isArray(data.installed) ? data.installed : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load extensions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return extensions.filter((extension) => {
      if (onlyInstalled && !installed.includes(extension.id)) return false;
      if (category !== "All" && extension.category !== category) return false;
      if (!needle) return true;
      return [extension.name, extension.blurb, extension.category, ...extension.adds]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [extensions, installed, onlyInstalled, category, query]);

  const filtersActive = Boolean(query) || category !== "All" || onlyInstalled;

  function resetFilters() {
    setQuery("");
    setCategory("All");
    setOnlyInstalled(false);
  }

  async function toggle(extension: BuildExtension) {
    const nextInstalled = !installed.includes(extension.id);
    setPending(extension.id);
    setError(null);
    try {
      const response = await fetch("/api/extensions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: extension.id, installed: nextInstalled }),
      });
      const data = (await response.json()) as { installed?: string[]; error?: string };
      if (!response.ok || !Array.isArray(data.installed)) {
        throw new Error(data.error || "Could not update that extension.");
      }
      setInstalled(data.installed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update that extension.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="page-scroll extensions-page">
      <div className="page-frame">
        <header className="page-head extensions-head">
          <span className="page-eyebrow">Extensions</span>
          <div className="page-head-row">
            <div>
              <h1>Build add-ons, installed once.</h1>
              <p>
                Extensions teach Cygnus how to handle accessibility, SEO, offline apps, motion,
                charts and launch pages. Install one here and it joins every Build-mode turn on
                this computer.
              </p>
            </div>
            <Link className="extensions-runtimes" href="/plugins">
              <Icon name="plugins" size={14} />
              Local runtimes
            </Link>
          </div>
        </header>

        <div className="extensions-summary" aria-live="polite">
          <span className={`status-dot ${installed.length > 0 ? "live" : "quiet"}`} />
          <strong>
            {loading
              ? "Reading installed extensions…"
              : installed.length > 0
                ? `${installed.length} installed`
                : "No extensions installed yet"}
          </strong>
          <span>
            {installed.length > 0
              ? "They apply to the next build you start. Remove one at any time."
              : "Install one below. Nothing runs until your next build."}
          </span>
        </div>

        <div className="extensions-toolbar">
          <label className="page-search extensions-search">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search extensions"
              aria-label="Search extensions"
              spellCheck={false}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            className={`extensions-installed-toggle ${onlyInstalled ? "on" : ""}`}
            onClick={() => setOnlyInstalled((value) => !value)}
            aria-pressed={onlyInstalled}
          >
            <Icon name="check" size={12} />
            Installed
            <span>{installed.length}</span>
          </button>
        </div>

        <div className="extensions-categories" role="group" aria-label="Filter by category">
          {ALL_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? "active" : ""}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {error ? <p className="page-error">{error}</p> : null}

        {loading ? (
          <div className="extensions-empty">
            <span className="extensions-empty-icon">
              <Icon name="extensions" size={22} />
            </span>
            <strong>Loading extensions…</strong>
            <p>Reading what is installed on this computer.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="extensions-empty">
            <span className="extensions-empty-icon">
              <Icon name="extensions" size={22} />
            </span>
            <strong>
              {onlyInstalled && installed.length === 0
                ? "Nothing installed yet"
                : "No extensions match"}
            </strong>
            <p>
              {onlyInstalled && installed.length === 0
                ? "Turn off the Installed filter, then pick an add-on that fits this app."
                : "Try a different search or category."}
            </p>
            {filtersActive ? (
              <button type="button" className="extensions-reset" onClick={resetFilters}>
                Clear filters
              </button>
            ) : (
              <button type="button" className="extensions-reset" onClick={() => void load()}>
                Try again
              </button>
            )}
          </div>
        ) : (
          <div className="extensions-grid">
            {visible.map((extension) => {
              const isInstalled = installed.includes(extension.id);
              const busy = pending === extension.id;
              const titleId = `extension-${extension.id}-title`;
              return (
                <article
                  className={`extension-card ${isInstalled ? "installed" : ""}`}
                  key={extension.id}
                  aria-labelledby={titleId}
                >
                  <div className="extension-card-head">
                    <span className={`extension-mark tone-${extension.category.toLowerCase()}`}>
                      {extension.mark}
                    </span>
                    <div className="extension-title">
                      <div className="extension-name-row">
                        <h2 id={titleId}>{extension.name}</h2>
                        <span className="extension-version">v{extension.version}</span>
                      </div>
                      <span className="extension-category">
                        {extension.category} · by Cygnus
                      </span>
                    </div>
                  </div>

                  <p className="extension-blurb">{extension.blurb}</p>

                  <ul className="extension-adds">
                    {extension.adds.map((add) => (
                      <li key={add}>
                        <Icon name="check" size={11} />
                        <span>{add}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="extension-card-foot">
                    <span className="extension-meta">Build rules · local</span>
                    {isInstalled ? (
                      <div className="extension-installed">
                        <span className="extension-installed-badge">
                          <Icon name="check" size={12} />
                          Installed
                        </span>
                        <button
                          type="button"
                          className="extension-remove"
                          onClick={() => void toggle(extension)}
                          disabled={busy}
                          aria-label={`Remove ${extension.name}`}
                        >
                          {busy ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="extension-install"
                        onClick={() => void toggle(extension)}
                        disabled={busy}
                        aria-label={`Install ${extension.name}`}
                      >
                        {busy ? "Installing…" : "Install"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="extensions-note">
          <span className="extensions-note-icon">
            <Icon name="sliders" size={18} />
          </span>
          <div>
            <strong>Installed locally, applied by Cygnus.</strong>
            <p>
              An install saves one entry in Cygnus&apos;s data folder on this computer.
              Extensions are build instruction packs, not third-party code: they change what
              Cygnus aims for in the next Build turn, and removing one takes effect immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
