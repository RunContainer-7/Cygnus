"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import Logo from "./Logo";
import { useProvider } from "./ProviderContext";
import { isDemo, providerLabel } from "@/lib/providers";

type ProjectSummary = {
  id: string;
  name: string;
  createdAt: string;
};

type ShellContextValue = {
  openSidebar: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function useAppShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useAppShell must be used inside AppShell.");
  return value;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { openSettings, provider } = useProvider();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
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
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const activeId = pathname.startsWith("/build/") ? pathname.split("/")[2] : null;
  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <ShellContext.Provider value={{ openSidebar: () => setOpen(true) }}>
      <div className="app">
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <div className="sidebar-head">
            <Link href="/" className="brand-link" aria-label="Cygnus home">
              <Logo />
            </Link>
          </div>

          <Link href="/" className="new-app">
            + New app
          </Link>

          <nav className="side-nav" aria-label="Workspace">
            <Link href="/" className={`side-link ${pathname === "/" ? "active" : ""}`}>
              Home
            </Link>
            <button type="button" className="side-link" onClick={openSettings}>
              Models
            </button>
          </nav>

          <div className="sidebar-label">
            Projects <span>{projects.length}</span>
          </div>
          <input
            type="search"
            className="sidebar-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
          />
          <nav className="project-list" aria-label="Projects">
            {projects.length === 0 ? (
              <p className="sidebar-empty">Nothing yet.</p>
            ) : filteredProjects.length === 0 ? (
              <p className="sidebar-empty">No matches.</p>
            ) : (
              filteredProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/build/${project.id}`}
                  className={`project-link ${project.id === activeId ? "active" : ""}`}
                  title={project.name}
                >
                  <span className="side-dot" aria-hidden="true" />
                  <span className="side-project-name">{project.name}</span>
                </Link>
              ))
            )}
          </nav>

          <div className="sidebar-foot">
            <button type="button" className="side-model" onClick={openSettings}>
              <span className={`status-dot ${isDemo(provider) ? "demo" : "live"}`} />
              <span>{providerLabel(provider)}</span>
            </button>
            <div className="side-foot-links">
              <button type="button" className="sidebar-action" onClick={openSettings}>
                Settings
              </button>
              <a
                href="https://github.com/RunContainer-7/Cygnus"
                target="_blank"
                rel="noreferrer"
                className="sidebar-action"
              >
                GitHub
              </a>
            </div>
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close projects"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <main className="app-main">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}
