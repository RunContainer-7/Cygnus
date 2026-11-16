"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useProvider } from "./ProviderContext";
import { isLocalEndpoint, normalizeBaseUrl } from "@/lib/endpoints";
import { HOSTED_BASE_URL } from "@/lib/hosted";
import {
  MODEL_TIERS,
  OPEN_SOURCE_MODELS,
  type ModelAccess,
  type OpenModel,
} from "@/lib/modelCatalog";
import { isDemo, loadProviderKey, providerLabel } from "@/lib/providers";

const ACCESS_TABS: Array<{ id: ModelAccess; label: string; sub: string }> = [
  { id: "hosted", label: "Hosted", sub: "Free" },
  { id: "local", label: "Local", sub: "Private" },
  { id: "byok", label: "BYOK", sub: "Your key" },
];

const TIER_ORDER = { low: 0, balanced: 1, max: 2 } as const;

function accessForProvider(provider: {
  baseUrl: string;
  model: string;
}): ModelAccess {
  if (normalizeBaseUrl(provider.baseUrl) === HOSTED_BASE_URL || isDemo(provider)) return "hosted";
  if (isLocalEndpoint(provider.baseUrl)) return "local";
  return "byok";
}

function tierLabel(entry: OpenModel): string {
  return MODEL_TIERS.find((item) => item.id === entry.tier)?.label ?? "Balanced";
}

export default function ModelMenu({
  onClose,
  onManage,
}: {
  onClose: () => void;
  onManage: () => void;
}) {
  const { provider, chooseProvider } = useProvider();
  const [access, setAccess] = useState<ModelAccess>(accessForProvider(provider));
  const [detecting, setDetecting] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const choiceToken = useRef(0);

  const counts = useMemo(() => {
    return OPEN_SOURCE_MODELS.reduce<Record<ModelAccess, number>>(
      (result, entry) => {
        result[entry.access] += 1;
        return result;
      },
      { hosted: 0, local: 0, byok: 0 },
    );
  }, []);

  const visible = useMemo(() => {
    return OPEN_SOURCE_MODELS.filter((entry) => entry.access === access).sort(
      (left, right) =>
        Number(Boolean(right.recommended)) - Number(Boolean(left.recommended)) ||
        TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
        left.name.localeCompare(right.name),
    );
  }, [access]);

  useEffect(() => {
    dialogRef.current?.focus();
    return () => {
      choiceToken.current += 1;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function choose(entry: OpenModel) {
    const token = ++choiceToken.current;
    const baseUrl = normalizeBaseUrl(entry.baseUrl);
    const apiKey = entry.access === "byok" ? loadProviderKey(baseUrl) : "";

    if (entry.access === "local" && entry.model === "local-model") {
      setDetecting(entry.id);
      setDiscoveryError(null);
      try {
        const response = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseUrl }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          models?: string[];
          error?: string;
        };
        if (token !== choiceToken.current) return;
        if (!response.ok) throw new Error(data.error ?? "Could not list models.");
        const first = data.models?.[0];
        if (!first) throw new Error("The server did not return a model.");
        chooseProvider({ baseUrl, model: first, apiKey: "", label: entry.provider });
        onClose();
      } catch (error) {
        if (token !== choiceToken.current) return;
        setDiscoveryError(
          `${entry.provider}: ${error instanceof Error ? error.message : "Could not reach the server."}`,
        );
      } finally {
        if (token === choiceToken.current) setDetecting(null);
      }
      return;
    }

    chooseProvider({
      baseUrl,
      model: entry.model,
      apiKey,
      label: entry.provider,
    });
    onClose();

    if (entry.access === "byok" && !apiKey) onManage();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="model-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="model-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-picker-title"
        tabIndex={-1}
      >
        <header className="mp-head">
          <div className="mp-head-copy">
            <span className="mp-eyebrow">Model</span>
            <h2 id="model-picker-title">Choose a model</h2>
            <p className="mp-current">
              Using <strong>{providerLabel(provider)}</strong>
              <span>· {provider.model}</span>
            </p>
          </div>
          <button type="button" className="mp-close" onClick={onClose} aria-label="Close model picker">
            <Icon name="close" size={17} />
          </button>
        </header>

        <div className="mp-access-tabs" role="tablist" aria-label="Model access">
          {ACCESS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={access === item.id}
              className={`mp-access-tab ${access === item.id ? "active" : ""}`}
              onClick={() => {
                setAccess(item.id);
                setDiscoveryError(null);
              }}
            >
              <span className="mp-access-title">
                {item.label}
                <span className="mp-access-count">{counts[item.id]}</span>
              </span>
              <span className="mp-access-sub">{item.sub}</span>
            </button>
          ))}
        </div>

        <div className="mp-scroll" role="tabpanel" aria-label={`${access} models`}>
          {visible.map((entry) => {
            const active =
              entry.model === provider.model &&
              normalizeBaseUrl(entry.baseUrl) === normalizeBaseUrl(provider.baseUrl);
            const hasKey =
              entry.access === "byok" ? Boolean(loadProviderKey(entry.baseUrl)) : false;

            return (
              <ModelRow
                key={entry.id}
                entry={entry}
                active={active}
                hasKey={hasKey}
                busy={detecting === entry.id}
                onChoose={() => void choose(entry)}
              />
            );
          })}
        </div>

        {discoveryError ? (
          <p className="mp-error" role="alert">
            {discoveryError}
          </p>
        ) : null}

        <footer className="mp-foot">
          <span>
            {access === "hosted"
              ? "Shared free capacity · may log prompts"
              : access === "local"
                ? "Runs on this computer · private"
                : "Keys stay in this browser"}
          </span>
          <button type="button" onClick={onManage}>
            Manage connections <Icon name="arrowUpRight" size={13} />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function ModelRow({
  entry,
  active,
  hasKey,
  busy,
  onChoose,
}: {
  entry: OpenModel;
  active: boolean;
  hasKey: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  const needsKey = entry.access === "byok" && !hasKey;
  return (
    <button
      type="button"
      className={`mp-row ${active ? "active" : ""}`}
      onClick={onChoose}
      aria-pressed={active}
      aria-busy={busy}
      disabled={busy}
    >
      <span className="mp-row-main">
        <span className="mp-row-title">
          {entry.name}
          {entry.recommended ? <em className="mp-badge rec">Recommended</em> : null}
          {entry.badge ? <em className="mp-badge">{entry.badge}</em> : null}
          <em className={`mp-tier-pill ${entry.tier}`}>{tierLabel(entry)}</em>
        </span>
        <span className="mp-row-sub">
          {entry.access === "hosted" ? entry.note : `${entry.provider} · ${entry.note}`}
        </span>
      </span>
      <span className="mp-row-side">
        {busy ? <span className="mp-key-hint">Detecting…</span> : null}
        {!busy && needsKey ? <span className="mp-key-hint">Add key</span> : null}
        {active ? (
          <span className="mp-check" aria-label="Selected">
            <Icon name="check" size={13} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
