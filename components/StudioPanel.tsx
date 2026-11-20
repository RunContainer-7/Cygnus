"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOVES, type MoveAction } from "@/lib/moves";
import type { FileEntry } from "@/lib/types";

type StudioTab = "snapshots" | "design" | "notes" | "data" | "moves";

type Snapshot = {
  id: string;
  label: string;
  createdAt: string;
  files: number;
  bytes: number;
};

const TABS: Array<{ id: StudioTab; label: string; hint: string }> = [
  { id: "snapshots", label: "Snapshots", hint: "Save and restore the files" },
  { id: "design", label: "Design", hint: "Colors and type in use" },
  { id: "notes", label: "Notes", hint: "Private project brief" },
  { id: "data", label: "Data", hint: "Import CSV rows" },
  { id: "moves", label: "Moves", hint: "64 real features" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "just now";
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows.slice(0, 500);
}

function collectDesign(files: FileEntry[]) {
  const colors = new Map<string, number>();
  const fonts = new Map<string, number>();
  const variables = new Map<string, string>();
  const radii = new Map<string, number>();

  const add = (map: Map<string, number>, value: string) => {
    const key = value.trim();
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const file of files) {
    if (!/\.(css|html|svg)$/i.test(file.path) || !file.content) continue;
    const content = file.content;
    for (const match of content.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const value = match[0].toLowerCase();
      if ([4, 5, 7, 9].includes(value.length)) continue;
      add(colors, value);
    }
    for (const match of content.matchAll(/\brgba?\([^)]{5,40}\)/gi)) {
      add(colors, match[0].replace(/\s+/g, " "));
    }
    for (const match of content.matchAll(/\bhsla?\([^)]{5,40}\)/gi)) {
      add(colors, match[0].replace(/\s+/g, " "));
    }
    for (const match of content.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const first = match[1].split(",")[0].replace(/["']/g, "").trim();
      if (first) add(fonts, first);
    }
    for (const match of content.matchAll(/border-radius\s*:\s*([^;}]+)/gi)) {
      add(radii, match[1].trim());
    }
    for (const match of content.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
      if (variables.size < 80) variables.set(`--${match[1]}`, match[2].trim());
    }
  }

  return {
    colors: [...colors.entries()].sort((a, b) => b[1] - a[1]),
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]),
    radii: [...radii.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    variables: [...variables.entries()],
  };
}

export default function StudioPanel({
  projectId,
  files,
  onClose,
  onChanged,
  onPrompt,
  onAction,
  initialTab = "snapshots",
}: {
  projectId: string;
  files: FileEntry[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onPrompt: (prompt: string) => void;
  onAction: (action: MoveAction) => void;
  initialTab?: StudioTab;
}) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);
  const [csv, setCsv] = useState("");
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const design = useMemo(() => collectDesign(files), [files]);
  const rows = useMemo(() => parseCsv(csv), [csv]);

  const runTool = useCallback(
    async (toolId: string) => {
      setBusy(toolId);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch(`/api/projects/${projectId}/tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolId }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          report?: string;
          wrote?: string[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "That move could not run.");
        setNotice(data.report ?? "Done.");
        await onChanged();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That move could not run.");
      } finally {
        setBusy(null);
      }
    },
    [projectId, onChanged],
  );

  const loadSnapshots = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/snapshots`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as {
        snapshots?: Snapshot[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not load checkpoints.");
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load checkpoints.");
    }
  }, [projectId]);

  const loadNotes = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/notes`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { notes?: string };
      if (!response.ok) throw new Error("Could not load notes.");
      setNotes(typeof data.notes === "string" ? data.notes : "");
      setNotesLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load notes.");
    }
  }, [projectId]);

  useEffect(() => {
    dialogRef.current?.focus();
    void loadSnapshots();
    const csvFile = files.find((file) => file.path === "data.csv");
    if (csvFile?.content) setCsv(csvFile.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "notes" && !notesLoaded) void loadNotes();
  }, [tab, notesLoaded, loadNotes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveSnapshot() {
    if (busy) return;
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: snapshotLabel.trim() || "Manual checkpoint" }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save a checkpoint.");
      setSnapshotLabel("");
      await loadSnapshots();
      setNotice("Checkpoint saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save a checkpoint.");
    } finally {
      setBusy(null);
    }
  }

  async function restore(snapshot: Snapshot) {
    if (busy) return;
    if (!window.confirm(`Restore “${snapshot.label}”? Current files are replaced.`)) return;
    setBusy(snapshot.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/snapshots/${snapshot.id}`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        files?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not restore that checkpoint.");
      await onChanged();
      setNotice(`Restored ${data.files ?? 0} files.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore that checkpoint.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(snapshot: Snapshot) {
    if (busy) return;
    setBusy(snapshot.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/snapshots/${snapshot.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not delete that checkpoint.");
      await loadSnapshots();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that checkpoint.");
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    if (busy) return;
    setBusy("notes");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save notes.");
      setNotesDirty(false);
      setNotice("Notes saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save notes.");
    } finally {
      setBusy(null);
    }
  }

  async function saveCsv(thenAsk: boolean) {
    if (busy) return;
    if (rows.length === 0) {
      setError("Paste a header row and at least one data row first.");
      return;
    }
    setBusy("csv");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "data.csv", content: csv }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save data.csv.");
      await onChanged();
      setNotice(`Saved data.csv with ${Math.max(0, rows.length - 1)} rows.`);
      if (thenAsk) {
        onPrompt(
          `Use data.csv (${Math.max(0, rows.length - 1)} rows, ${rows[0]?.length ?? 0} columns) as the app's data source. Build a searchable, sortable table with a detail view, empty state, and localStorage-backed edits. Keep the CSV as read-only seed data.`,
        );
        onClose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save data.csv.");
    } finally {
      setBusy(null);
    }
  }

  async function copyTokens() {
    const lines = [
      ":root {",
      ...design.colors.slice(0, 12).map(([color], index) => `  --color-${index + 1}: ${color};`),
      ...design.fonts.slice(0, 4).map(([font], index) => `  --font-${index + 1}: "${font}";`),
      ...design.radii.map(([radius], index) => `  --radius-${index + 1}: ${radius};`),
      "}",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setNotice("CSS variables copied.");
    } catch {
      setError("The clipboard is unavailable.");
    }
  }

  const filteredMoves = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return MOVES;
    return MOVES.filter(
      (move) =>
        move.app.toLowerCase().includes(needle) ||
        move.title.toLowerCase().includes(needle) ||
        move.blurb.toLowerCase().includes(needle),
    );
  }, [query]);

  return (
    <div
      className="studio-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="studio-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="studio-head">
          <div>
            <span className="studio-eyebrow">Project tools</span>
            <h2 id="studio-title">Studio</h2>
          </div>
          <button type="button" className="studio-close" onClick={onClose} aria-label="Close studio">
            ×
          </button>
        </header>

        <div className="studio-tabs" role="tablist" aria-label="Studio sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`studio-tab ${tab === item.id ? "active" : ""}`}
              onClick={() => {
                setTab(item.id);
                setError(null);
              }}
              title={item.hint}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="studio-body">
          {tab === "snapshots" ? (
            <section className="studio-section">
              <p className="studio-lead">
                Checkpoints copy the project files outside the app folder, so a restore never
                leaves a snapshot inside a publish or a zip. The last 20 are kept.
              </p>
              <div className="studio-inline">
                <input
                  value={snapshotLabel}
                  onChange={(event) => setSnapshotLabel(event.target.value)}
                  placeholder="Label this checkpoint"
                  aria-label="Checkpoint label"
                  maxLength={90}
                />
                <button type="button" onClick={() => void saveSnapshot()} disabled={busy !== null}>
                  {busy === "save" ? "Saving…" : "Save checkpoint"}
                </button>
              </div>
              {snapshots.length === 0 ? (
                <p className="studio-empty">
                  No checkpoints yet. Save one before a big change, then restore it if the
                  change goes wrong.
                </p>
              ) : (
                <ul className="snapshot-list">
                  {snapshots.map((snapshot) => (
                    <li key={snapshot.id}>
                      <div className="snapshot-copy">
                        <strong>{snapshot.label}</strong>
                        <span>
                          {snapshot.files} files · {formatBytes(snapshot.bytes)} ·{" "}
                          {relativeTime(snapshot.createdAt)}
                        </span>
                      </div>
                      <div className="snapshot-actions">
                        <button
                          type="button"
                          onClick={() => void restore(snapshot)}
                          disabled={busy !== null}
                        >
                          {busy === snapshot.id ? "Restoring…" : "Restore"}
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => void remove(snapshot)}
                          disabled={busy !== null}
                          aria-label={`Delete ${snapshot.label}`}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "design" ? (
            <section className="studio-section">
              <p className="studio-lead">
                Every color, font, radius, and custom property found in the project. Copy them as
                CSS variables and use the same values everywhere.
              </p>
              <div className="token-stack">
                <div>
                  <h3>Colors</h3>
                  {design.colors.length === 0 ? (
                    <p className="studio-empty">No colors found yet.</p>
                  ) : (
                    <div className="swatch-grid">
                      {design.colors.slice(0, 18).map(([color, count]) => (
                        <div className="swatch" key={color}>
                          <span className="swatch-chip" style={{ background: color }} />
                          <code>{color}</code>
                          <em>{count}×</em>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h3>Type</h3>
                  {design.fonts.length === 0 ? (
                    <p className="studio-empty">No font stacks found yet.</p>
                  ) : (
                    <ul className="token-list">
                      {design.fonts.slice(0, 8).map(([font, count]) => (
                        <li key={font}>
                          <span style={{ fontFamily: font }}>{font}</span>
                          <em>{count}×</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>Radii</h3>
                  {design.radii.length === 0 ? (
                    <p className="studio-empty">No border radii found yet.</p>
                  ) : (
                    <ul className="token-list">
                      {design.radii.map(([radius, count]) => (
                        <li key={radius}>
                          <code>{radius}</code>
                          <em>{count}×</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {design.variables.length > 0 ? (
                  <div>
                    <h3>Custom properties</h3>
                    <ul className="token-list">
                      {design.variables.slice(0, 20).map(([name, value]) => (
                        <li key={name}>
                          <code>{name}</code>
                          <span>{value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <button type="button" className="studio-primary" onClick={() => void copyTokens()}>
                Copy as CSS variables
              </button>
            </section>
          ) : null}

          {tab === "notes" ? (
            <section className="studio-section">
              <p className="studio-lead">
                A private brief kept outside the project folder. It is never published and never
                included in a zip. Use it for the audience, the promise, and what you refuse to add.
              </p>
              <textarea
                className="notes-area"
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setNotesDirty(true);
                }}
                placeholder={"Who is this for?\nWhat is the one action?\nWhat should never appear?"}
                rows={14}
                aria-label="Project notes"
              />
              <div className="studio-inline">
                <span className="studio-meta">
                  {notesDirty ? "Unsaved changes" : notesLoaded ? "Saved on this computer" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void saveNotes()}
                  disabled={busy !== null || !notesDirty}
                >
                  {busy === "notes" ? "Saving…" : "Save notes"}
                </button>
              </div>
              <button
                type="button"
                className="quiet studio-secondary"
                onClick={() => {
                  setNotes(
                    [
                      "# Brief",
                      "",
                      "## Audience",
                      "Who is this for, in one sentence.",
                      "",
                      "## Promise",
                      "What the app does, in plain words.",
                      "",
                      "## One action",
                      "The single thing every screen points at.",
                      "",
                      "## Screens",
                      "- Home",
                      "- Detail",
                      "",
                      "## Rules",
                      "- No dead controls.",
                      "- Works at 360px.",
                      "- Data stays in the browser.",
                    ].join("\n"),
                  );
                  setNotesDirty(true);
                }}
              >
                Insert a brief template
              </button>
            </section>
          ) : null}

          {tab === "data" ? (
            <section className="studio-section">
              <p className="studio-lead">
                Paste CSV from a spreadsheet. It is saved as <code>data.csv</code> in the project,
                so a static app can load it without a server.
              </p>
              <textarea
                className="notes-area data-area"
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                placeholder={"name,category,price\nMiso,coffee,4.50\nJuniper,tea,3.80"}
                rows={8}
                spellCheck={false}
                aria-label="CSV data"
              />
              {rows.length > 0 ? (
                <div className="csv-preview">
                  <div className="csv-meta">
                    {Math.max(0, rows.length - 1)} rows · {rows[0]?.length ?? 0} columns
                  </div>
                  <div className="csv-scroll">
                    <table>
                      <thead>
                        <tr>
                          {(rows[0] ?? []).map((cell, index) => (
                            <th key={`head-${index}`}>{cell || `Column ${index + 1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(1, 7).map((row, rowIndex) => (
                          <tr key={`row-${rowIndex}`}>
                            {row.map((cell, cellIndex) => (
                              <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              <div className="studio-inline">
                <button
                  type="button"
                  onClick={() => void saveCsv(false)}
                  disabled={busy !== null || rows.length === 0}
                >
                  {busy === "csv" ? "Saving…" : "Save data.csv"}
                </button>
                <button
                  type="button"
                  className="studio-primary"
                  onClick={() => void saveCsv(true)}
                  disabled={busy !== null || rows.length === 0}
                >
                  Save &amp; build a table
                </button>
              </div>
            </section>
          ) : null}

          {tab === "moves" ? (
            <section className="studio-section">
              <p className="studio-lead">
                One real feature from each product on your list. Every move either opens a
                Cygnus surface or writes working code, config or an audit into this project.
              </p>
              <input
                className="moves-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${MOVES.length} moves, apps, or ideas`}
                aria-label="Search moves"
                spellCheck={false}
              />
              <div className="moves-grid">
                {filteredMoves.map((move) => (
                  <article className="move-card" key={move.app}>
                    <header>
                      <span>{move.app}</span>
                      <h3>{move.title}</h3>
                    </header>
                    <p>{move.blurb}</p>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        if (move.action) {
                          onAction(move.action);
                          return;
                        }
                        if (move.tool) {
                          void runTool(move.tool);
                          return;
                        }
                        onPrompt(`${move.title} for ${move.app}`);
                      }}
                    >
                      {busy === move.tool
                        ? "Running…"
                        : move.action
                          ? "Open"
                          : "Run"}
                    </button>
                  </article>
                ))}
              </div>
              {filteredMoves.length === 0 ? (
                <p className="studio-empty">No move matches “{query}”.</p>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <p className="studio-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="studio-notice" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
