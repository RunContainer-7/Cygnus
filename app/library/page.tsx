"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import type { FileEntry } from "@/lib/types";

type LibraryProject = {
  id: string;
  name: string;
  createdAt: string;
  fileCount: number;
  files: FileEntry[];
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "html" || extension === "htm") return "HTML";
  if (extension === "css") return "CSS";
  if (extension === "js" || extension === "mjs" || extension === "ts") return "JS";
  if (extension === "json" || extension === "md" || extension === "txt") return "Text";
  return "Other";
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function LibraryPage() {
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not read the library.");
      const data = (await response.json()) as { projects?: LibraryProject[] };
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read the library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const kinds = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((project) => project.files.forEach((file) => set.add(fileKind(file.path))));
    return ["All", ...Array.from(set).sort()];
  }, [projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects
      .map((project) => {
        const files = project.files.filter((file) => {
          if (kind !== "All" && fileKind(file.path) !== kind) return false;
          if (!needle) return true;
          return `${project.name} ${file.path}`.toLowerCase().includes(needle);
        });
        return { ...project, files };
      })
      .filter((project) => project.files.length > 0);
  }, [projects, query, kind]);

  const totalFiles = projects.reduce((total, project) => total + project.files.length, 0);
  const totalBytes = projects.reduce(
    (total, project) =>
      total + project.files.reduce((sum, file) => sum + file.size, 0),
    0,
  );

  return (
    <div className="page-scroll library-page">
      <div className="page-frame">
        <header className="page-head">
          <span className="page-eyebrow">Library</span>
          <div className="page-head-row">
            <div>
              <h1>Everything you&apos;ve made.</h1>
              <p>
                Real files from every workspace, in one place. Nothing is uploaded to a
                cloud account.
              </p>
            </div>
            <button
              type="button"
              className="page-refresh"
              onClick={() => void load()}
              disabled={loading}
            >
              <Icon name="refresh" size={14} />
              {loading ? "Reading…" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="library-stats">
          <div>
            <span>Apps</span>
            <strong>{projects.length}</strong>
          </div>
          <div>
            <span>Files</span>
            <strong>{totalFiles}</strong>
          </div>
          <div>
            <span>On disk</span>
            <strong>{formatSize(totalBytes)}</strong>
          </div>
          <div className="library-stats-note">
            <span className="panel-foot-dot" />
            Stored in your local Cygnus workspace
          </div>
        </div>

        <div className="library-toolbar">
          <label className="page-search">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps and files"
              aria-label="Search apps and files"
              spellCheck={false}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </label>
          <div className="category-row" aria-label="File types">
            {kinds.map((item) => (
              <button
                key={item}
                type="button"
                className={kind === item ? "active" : ""}
                onClick={() => setKind(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="page-error">{error}</p> : null}

        {!loading && projects.length === 0 ? (
          <div className="page-empty">
            <span className="page-empty-icon">
              <Icon name="library" size={22} />
            </span>
            <strong>Your library is empty.</strong>
            <p>Build your first app and its files will show up here.</p>
            <Link href="/" className="page-empty-link">
              Start building <Icon name="arrowRight" size={13} />
            </Link>
          </div>
        ) : null}

        {!loading && projects.length > 0 && filtered.length === 0 ? (
          <div className="page-empty">
            <span className="page-empty-icon">
              <Icon name="search" size={22} />
            </span>
            <strong>No files match.</strong>
            <p>Try another file type or search term.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setKind("All");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}

        <div className="library-groups">
          {filtered.map((project) => (
            <section className="library-group" key={project.id}>
              <header className="library-group-head">
                <div className="library-group-title">
                  <span className="library-avatar">{initials(project.name)}</span>
                  <div>
                    <h2>{project.name}</h2>
                    <span>
                      {project.fileCount} file{project.fileCount === 1 ? "" : "s"} ·{" "}
                      {new Date(project.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <Link href={`/build/${project.id}`} className="library-open">
                  Open app <Icon name="arrowUpRight" size={13} />
                </Link>
              </header>
              <div className="library-file-list">
                {project.files.map((file) => (
                  <div className="library-file" key={file.path}>
                    <span className="library-file-icon">
                      <Icon name={fileKind(file.path) === "JS" ? "code" : "file"} size={14} />
                    </span>
                    <span className="library-file-path">{file.path}</span>
                    <span className="library-file-kind">{fileKind(file.path)}</span>
                    <span className="library-file-size">{formatSize(file.size)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
