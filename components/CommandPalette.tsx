"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
};

export default function CommandPalette({
  open,
  actions,
  onClose,
}: {
  open: boolean;
  actions: PaletteAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) =>
      `${action.group} ${action.label} ${action.hint ?? ""}`.toLowerCase().includes(needle),
    );
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function run(action: PaletteAction | undefined) {
    if (!action) return;
    onClose();
    action.run();
  }

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <span aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((value) => (filtered.length === 0 ? 0 : (value + 1) % filtered.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((value) =>
                  filtered.length === 0 ? 0 : (value - 1 + filtered.length) % filtered.length,
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(filtered[index]);
              }
            }}
            placeholder="Type a command or search"
            aria-label="Search commands"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <p className="palette-empty">No command matches “{query}”.</p>
          ) : (
            filtered.map((action, actionIndex) => (
              <button
                key={action.id}
                type="button"
                role="option"
                aria-selected={actionIndex === index}
                className={`palette-row ${actionIndex === index ? "active" : ""}`}
                onMouseEnter={() => setIndex(actionIndex)}
                onClick={() => run(action)}
              >
                <span className="palette-group">{action.group}</span>
                <span className="palette-label">{action.label}</span>
                {action.hint ? <span className="palette-hint">{action.hint}</span> : null}
              </button>
            ))
          )}
        </div>
        <footer className="palette-foot">
          <span>↑↓ to move</span>
          <span>Enter to run</span>
          <span>Ctrl/Cmd + K to toggle</span>
        </footer>
      </div>
    </div>
  );
}
