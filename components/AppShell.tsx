"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Icon, { type IconName } from "./Icon";
import Logo from "./Logo";
import ModelMenu from "./ModelMenu";
import UpdateToast from "./UpdateToast";
import { useProvider } from "./ProviderContext";
import { providerLabel } from "@/lib/providers";
import { APP_VERSION } from "@/lib/version";

type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
  fileCount?: number;
};

const FAVORITES_KEY = "cygnus.favorite-apps.v1";
const PANEL_KEY = "cygnus.apps-panel.v1";

const NAV_ITEMS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Apps", icon: "apps" },
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/library", label: "Library", icon: "library" },
  { href: "/templates", label: "Templates", icon: "templates" },
  { href: "/plugins", label: "Plugins", icon: "plugins" },
  { href: "/extensions", label: "Extensions", icon: "extensions" },
];

const PAGE_LABELS: Record<string, string> = {
  "/": "New app",
  "/settings": "Settings",
  "/library": "Library",
  "/templates": "Templates",
  "/plugins": "Plugins",
  "/extensions": "Extensions",
};

function sectionFor(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/build/")) return "apps";
  const match = NAV_ITEMS.find(
    (item) => item.href !== "/" && pathname.startsWith(item.href),
  );
  return match?.href.slice(1) ?? "apps";
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "C";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function avatarTone(id: string): number {
  let total = 0;
  for (let index = 0; index < id.length; index += 1) total += id.charCodeAt(index);
  return total % 4;
}

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "just now";
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { provider } = useProvider();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const activeId = pathname.startsWith("/build/") ? pathname.split("/")[2] : null;
  const currentProject = projects.find((project) => project.id === activeId);
  const activeSection = sectionFor(pathname);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setFavorites(parsed.filter((item): item is string => typeof item === "string"));
        }
      }
      setCollapsed(window.localStorage.getItem(PANEL_KEY) === "closed");
    } catch {
      // Preferences are optional; the shell works without storage.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/projects", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((data: { projects?: ProjectSummary[] }) => {
        if (!alive) return;
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      })
      .catch(() => {
        if (alive) setProjects([]);
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    setMobilePanelOpen(false);
    setModelMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_KEY, collapsed ? "closed" : "open");
    } catch {
      // Ignore storage failures.
    }
  }, [collapsed]);

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(needle));
  }, [projects, query]);

  const favoriteProjects = filteredProjects.filter((project) =>
    favorites.includes(project.id),
  );
  const otherProjects = filteredProjects.filter(
    (project) => !favorites.includes(project.id),
  );

  function toggleFavorite(id: string) {
    setFavorites((previous) => {
      const next = previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }

  async function removeProject(project: ProjectSummary) {
    const confirmed = window.confirm(
      `Delete “${project.name}”? Its files and chat history are removed from this computer.`,
    );
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete that app.");
      setProjects((previous) => previous.filter((item) => item.id !== project.id));
      setFavorites((previous) => previous.filter((id) => id !== project.id));
      if (project.id === activeId) router.push("/");
    } catch {
      window.alert("That app could not be deleted. Check that no preview is holding its files.");
    }
  }

  function togglePanel() {
    if (window.matchMedia("(max-width: 1040px)").matches) {
      setMobilePanelOpen(true);
      return;
    }
    setCollapsed((value) => !value);
  }

  function renderRow(project: ProjectSummary) {
    const favorite = favorites.includes(project.id);
    return (
      <div
        className={`app-row ${project.id === activeId ? "active" : ""}`}
        key={project.id}
      >
        <Link
          href={`/build/${project.id}`}
          className="app-row-link"
          onClick={() => setMobilePanelOpen(false)}
        >
          <span className={`app-avatar avatar-${avatarTone(project.id)}`}>
            {initialsFor(project.name)}
          </span>
          <span className="app-row-copy">
            <strong>{project.name}</strong>
            <span>
              {project.fileCount ?? 0} file{project.fileCount === 1 ? "" : "s"} ·{" "}
              {relativeTime(project.createdAt)}
            </span>
          </span>
        </Link>
        <button
          type="button"
          className={`app-star ${favorite ? "on" : ""}`}
          onClick={() => toggleFavorite(project.id)}
          aria-label={favorite ? `Unfavorite ${project.name}` : `Favorite ${project.name}`}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Icon name={favorite ? "starFilled" : "star"} size={14} />
        </button>
        <button
          type="button"
          className="app-delete"
          onClick={() => void removeProject(project)}
          aria-label={`Delete ${project.name}`}
          title="Delete app"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className={`shell ${collapsed ? "panel-collapsed" : ""}`}>
      <header className="shell-top">
        <Link href="/" className="shell-brand" aria-label="Cygnus home">
          <Logo />
        </Link>

        <div className="shell-context">
          <span className="shell-context-name">
            {currentProject?.name ?? "No app selected"}
          </span>
          <span className="shell-thread">
            {currentProject ? "Initial conversation" : PAGE_LABELS[pathname] ?? "Workspace"}
          </span>
        </div>

        <div className="shell-top-actions">
          <button
            type="button"
            className="shell-model"
            onClick={() => setModelMenuOpen((value) => !value)}
            aria-expanded={modelMenuOpen}
            aria-haspopup="dialog"
            title="Choose a model"
          >
            <span className={`status-dot ${provider.baseUrl === "demo" ? "demo" : "live"}`} />
            <span className="shell-model-label">{providerLabel(provider)}</span>
            <Icon name="chevronDown" size={13} className="shell-model-caret" />
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
          <button
            type="button"
            className="shell-panel-toggle"
            onClick={togglePanel}
            aria-label={mobilePanelOpen ? "Close apps" : "Open apps"}
            aria-expanded={mobilePanelOpen}
          >
            <Icon name="panel" size={18} />
          </button>
        </div>
      </header>

      <div className="shell-body">
        <nav className="rail" aria-label="Primary navigation">
          <button
            type="button"
            className="rail-menu"
            onClick={togglePanel}
            aria-label={collapsed ? "Show apps panel" : "Hide apps panel"}
          >
            <Icon name="menu" size={19} />
          </button>
          <div className="rail-nav">
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/" ? activeSection === "apps" : activeSection === item.href.slice(1);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rail-item ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon name={item.icon} size={19} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <aside className={`apps-panel ${mobilePanelOpen ? "mobile-open" : ""}`}>
          <div className="apps-panel-head">
            <div>
              <span className="panel-eyebrow">Workspace</span>
              <h1>Apps</h1>
            </div>
            <button
              type="button"
              className="panel-close"
              onClick={() => setMobilePanelOpen(false)}
              aria-label="Close apps panel"
            >
              <Icon name="close" size={17} />
            </button>
          </div>

          <Link
            href="/"
            className="panel-new"
            onClick={() => setMobilePanelOpen(false)}
          >
            <Icon name="plus" size={15} />
            New app
          </Link>

          <Link
            href="/settings#github"
            className="panel-import"
            onClick={() => setMobilePanelOpen(false)}
          >
            <Icon name="library" size={14} />
            Import from GitHub
          </Link>

          <label className="panel-search">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps"
              aria-label="Search apps"
              spellCheck={false}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </label>

          <div className="panel-scroll">
            {!query ? (
              <section className="panel-section">
                <div className="panel-section-head">
                  <span>Favorite apps</span>
                  <span>{favoriteProjects.length}</span>
                </div>
                {favoriteProjects.length > 0 ? (
                  <div className="app-list">{favoriteProjects.map(renderRow)}</div>
                ) : (
                  <p className="panel-hint">
                    <Icon name="star" size={13} />
                    Star an app to pin it here.
                  </p>
                )}
              </section>
            ) : null}

            <section className="panel-section">
              <div className="panel-section-head">
                <span>{query ? "Results" : "Other apps"}</span>
                <span>{query ? filteredProjects.length : otherProjects.length}</span>
              </div>
              {otherProjects.length > 0 ? (
                <div className="app-list">{otherProjects.map(renderRow)}</div>
              ) : projects.length === 0 ? (
                <div className="panel-empty-apps">
                  <span className="panel-empty-icon">
                    <Icon name="apps" size={19} />
                  </span>
                  <strong>No apps yet</strong>
                  <p>Describe your first app and it will show up here.</p>
                  <Link href="/" onClick={() => setMobilePanelOpen(false)}>
                    Start building <Icon name="arrowRight" size={13} />
                  </Link>
                </div>
              ) : query ? (
                <p className="panel-hint">No apps match “{query}”.</p>
              ) : (
                <p className="panel-hint">
                  {favoriteProjects.length > 0
                    ? "All apps are pinned above."
                    : "Every app you create will appear here."}
                </p>
              )}
            </section>
          </div>

          <div className="panel-foot">
            <span className="panel-foot-dot" />
            Projects stay on this computer
          </div>
        </aside>

        {mobilePanelOpen ? (
          <button
            type="button"
            className="panel-scrim"
            onClick={() => setMobilePanelOpen(false)}
            aria-label="Close apps panel"
          />
        ) : null}

        <main className="shell-main">{children}</main>
      </div>

      <footer className="shell-versionbar">
        <span>Cygnus v{APP_VERSION}</span>
        <span className="shell-version-sep" aria-hidden="true" />
        <span>MIT · runs on this computer</span>
      </footer>

      <UpdateToast />
    </div>
  );
}
