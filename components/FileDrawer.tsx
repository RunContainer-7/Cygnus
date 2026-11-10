"use client";

import { useEffect, useState } from "react";
import type { FileEntry } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function FileDrawer({
  files,
  open,
  initialPath,
  onClose,
}: {
  files: FileEntry[];
  open: boolean;
  initialPath?: string | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      return;
    }
    if (initialPath && files.some((file) => file.path === initialPath)) {
      setSelected(initialPath);
    } else {
      setSelected(files[0]?.path ?? null);
    }
    // Only reset the selection when the drawer opens or is pointed at a new file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath]);

  useEffect(() => {
    if (open && files.length > 0 && !selected) setSelected(files[0].path);
  }, [open, files, selected]);

  if (!open) return null;

  const active = files.find((file) => file.path === selected) ?? files[0];

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Project files">
        <header>
          <h3>Project files</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close files">
            ×
          </button>
        </header>

        {files.length === 0 ? (
          <p className="drawer-empty">No files yet — ask Cygnus to build something.</p>
        ) : (
          <div className="drawer-body">
            <ul className="file-list">
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className={file.path === active?.path ? "active" : ""}
                    onClick={() => setSelected(file.path)}
                  >
                    {file.path}
                    <span>{formatBytes(file.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="file-view">
              <div className="file-view-head">{active?.path}</div>
              <pre>{active?.content ?? ""}</pre>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
