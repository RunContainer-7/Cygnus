"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProvider } from "@/components/ProviderContext";
import { DOCS_URL } from "@/lib/docs";
import { isHosted } from "@/lib/providers";

type Usage = {
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  resetsAt: string;
  resetInSeconds: number;
  totalCalls: number;
};

function resetClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "the next hour";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function HostedUsage() {
  const { provider } = useProvider();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hosted = isHosted(provider);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/usage", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as Usage;
      if (typeof data.limit !== "number" || typeof data.used !== "number") return;
      setUsage(data);
    } catch {
      // The meter is optional; a failed read must not break the shell.
    }
  }, []);

  useEffect(() => {
    if (!hosted) {
      setUsage(null);
      setOpen(false);
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener("cygnus:usage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("cygnus:usage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [hosted, load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
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

  if (!hosted || !usage) return null;

  const used = Math.min(usage.used, usage.limit);
  const percent =
    usage.limit > 0 ? Math.min(100, Math.round((used / usage.limit) * 100)) : 0;
  const tone = used >= usage.limit ? "full" : percent >= 80 ? "warn" : "";
  const minutes = Math.max(
    1,
    Math.ceil((new Date(usage.resetsAt).getTime() - Date.now()) / 60_000),
  );

  return (
    <div className="shell-usage-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`shell-usage ${tone}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${used} of ${usage.limit} hosted model calls this hour`}
      >
        <span className="shell-usage-bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </span>
        <span className="shell-usage-count">
          {used}/{usage.limit}
        </span>
        <span className="shell-usage-word">hosted calls</span>
      </button>

      {open ? (
        <div className="shell-usage-pop" role="dialog" aria-label="Free hosted budget">
          <div className="shell-usage-pop-head">
            <strong>Free hosted budget</strong>
            <span className={`shell-usage-pill ${tone}`}>{percent}%</span>
          </div>
          <div
            className={`shell-usage-track ${tone}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={usage.limit}
            aria-valuenow={used}
            aria-label="Hosted calls used this hour"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="shell-usage-big">
            {used} of {usage.limit} model calls this hour
          </p>
          <p className="shell-usage-meta">
            Resets at {resetClock(usage.resetsAt)} · in {minutes} min
          </p>
          <p className="shell-usage-note">
            Kilo&apos;s free tier allows 200 calls per hour per IP address. A chat message is
            usually one call; a build spends one per tool round, often 3–8. The count is kept on
            this computer, so other apps on your network share the real limit.
          </p>
          <p className="shell-usage-total">{usage.totalCalls.toLocaleString()} calls all time</p>
          <a
            className="shell-usage-link"
            href={`${DOCS_URL}/models`}
            target="_blank"
            rel="noreferrer"
          >
            How hosted models work →
          </a>
        </div>
      ) : null}
    </div>
  );
}
