"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { useProvider } from "./ProviderContext";
import { BUILD_MODES, modeDisabledReason, supportedModes, type BuildMode } from "@/lib/modes";
import { providerLabel } from "@/lib/providers";

/**
 * Plan / Chat / Build switch. Chat is the default. Modes a model cannot run
 * (anything needing tools, for a chat-only model) stay visible but disabled.
 */
export default function ModeMenu({
  mode,
  onChange,
  align = "left",
}: {
  mode: BuildMode;
  onChange: (mode: BuildMode) => void;
  align?: "left" | "right";
}) {
  const { provider } = useProvider();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const supported = supportedModes(provider);
  const current = BUILD_MODES.find((item) => item.id === mode) ?? BUILD_MODES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`mode-wrap ${align === "right" ? "align-right" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="mode-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={`${current.label} · ${current.short}`}
      >
        <span className={`mode-dot ${current.id}`} aria-hidden="true" />
        <span className="mode-trigger-label">{current.label}</span>
        <Icon name="chevronDown" size={12} />
      </button>

      {open ? (
        <div className={`mode-menu ${align === "right" ? "align-right" : ""}`} role="listbox">
          <span className="mode-menu-head">Mode</span>
          {BUILD_MODES.map((item) => {
            const enabled = supported.includes(item.id);
            const why =
              modeDisabledReason(item.id, providerLabel(provider)) ??
              "This model can't call tools.";
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={mode === item.id}
                className={`mode-option ${mode === item.id ? "active" : ""}`}
                disabled={!enabled}
                title={enabled ? item.hint : why}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                <span className="mode-option-copy">
                  <strong>{item.label}</strong>
                  <span>{enabled ? item.hint : why}</span>
                </span>
                {mode === item.id ? <Icon name="check" size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
