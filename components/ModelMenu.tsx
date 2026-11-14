"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useProvider } from "./ProviderContext";
import { normalizeBaseUrl } from "@/lib/endpoints";
import {
  MODEL_TIERS,
  OPEN_SOURCE_MODELS,
  type ModelAccess,
  type ModelTier,
  type OpenModel,
} from "@/lib/modelCatalog";
import { loadProviderKey } from "@/lib/providers";

const ACCESS_TABS: Array<{ id: ModelAccess; label: string; sub: string }> = [
  { id: "hosted", label: "Hosted", sub: "Free · no key" },
  { id: "local", label: "Local", sub: "On this machine" },
  { id: "byok", label: "BYOK", sub: "Your API key" },
];

const ACCESS_LABELS: Record<ModelAccess, string> = {
  hosted: "Cygnus Hosted · shared free capacity",
  local: "On this computer · no key",
  byok: "Your provider · API key",
};

export default function ModelMenu({
  onClose,
  onManage,
}: {
  onClose: () => void;
  onManage: () => void;
}) {
  const { provider, chooseProvider } = useProvider();
  const current = OPEN_SOURCE_MODELS.find(
    (entry) =>
      entry.model === provider.model &&
      normalizeBaseUrl(entry.baseUrl) === normalizeBaseUrl(provider.baseUrl),
  );
  const [access, setAccess] = useState<ModelAccess>(current?.access ?? "hosted");
  const [tier, setTier] = useState<ModelTier>(current?.tier ?? "balanced");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tierInfo = MODEL_TIERS.find((item) => item.id === tier) ?? MODEL_TIERS[1];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return OPEN_SOURCE_MODELS.filter((entry) => {
      if (entry.access !== access) return false;
      if (entry.tier !== tier) return false;
      if (!needle) return true;
      return `${entry.name} ${entry.provider} ${entry.note} ${entry.model}`
        .toLowerCase()
        .includes(needle);
    }).sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)));
  }, [access, tier, query]);

  function choose(entry: OpenModel) {
    const baseUrl = normalizeBaseUrl(entry.baseUrl);
    const apiKey = entry.access === "byok" ? loadProviderKey(baseUrl) : "";
    chooseProvider({
      baseUrl,
      model: entry.model,
      apiKey,
      label: entry.provider,
    });
    onClose();

    if (entry.access === "byok" && !apiKey) {
      onManage();
      return;
    }

    if (entry.access === "local" && entry.model === "local-model") {
      fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { models?: string[] } | null) => {
          const first = data?.models?.[0];
          if (!first) return;
          chooseProvider({ baseUrl, model: first, apiKey: "", label: entry.provider });
        })
        .catch(() => {
          // The saved endpoint still works; model discovery can be retried in Settings.
        });
    }
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
        className="model-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-picker-title"
      >
        <header className="mp-head">
          <div>
            <span className="mp-eyebrow">
              <span className="mp-eyebrow-dot" />
              Open models · pick a lane
            </span>
            <h2 id="model-picker-title">Choose a model</h2>
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
              onClick={() => setAccess(item.id)}
            >
              <span className="mp-access-title">{item.label}</span>
              <span className="mp-access-sub">{item.sub}</span>
            </button>
          ))}
        </div>

        <div className="mp-tiers" role="tablist" aria-label="Model capability tier">
          {MODEL_TIERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tier === item.id}
              className={`mp-tier ${tier === item.id ? "active" : ""}`}
              onClick={() => setTier(item.id)}
            >
              <span>{item.label}</span>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="mp-tier-hint">{tierInfo.hint}</p>

        <label className="mp-search">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${access === "byok" ? "BYOK" : access} models`}
            aria-label={`Search ${access} models`}
            spellCheck={false}
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </label>

        <div className="mp-scroll">
          {visible.length === 0 ? (
            <p className="mp-empty">No open models match “{query}”.</p>
          ) : null}

          {visible.length > 0 ? (
            <section className="mp-group">
              <div className="mp-group-label">{ACCESS_LABELS[access]}</div>

              {access === "hosted" ? (
                <div className="mp-notice">
                  Free hosted models use shared public capacity and may log prompts upstream.
                  Use <strong>Local</strong> for private code.
                </div>
              ) : null}

              {visible.map((entry) => (
                <ModelRow
                  key={entry.id}
                  entry={entry}
                  active={
                    entry.model === provider.model &&
                    normalizeBaseUrl(entry.baseUrl) === normalizeBaseUrl(provider.baseUrl)
                  }
                  onChoose={() => choose(entry)}
                />
              ))}
            </section>
          ) : null}
        </div>

        <footer className="mp-foot">
          <span>
            {access === "hosted"
              ? "No key. Shared free capacity."
              : access === "local"
                ? "Runs on your computer."
                : "Uses the key saved in Settings."}
          </span>
          <button type="button" onClick={onManage}>
            All models <Icon name="arrowUpRight" size={13} />
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
  onChoose,
}: {
  entry: OpenModel;
  active: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className={`mp-row ${active ? "active" : ""}`}
      onClick={onChoose}
      aria-pressed={active}
    >
      <span className="mp-row-mark" aria-hidden="true">
        {entry.name.charAt(0)}
      </span>
      <span className="mp-row-main">
        <span className="mp-row-title">
          {entry.name}
          {entry.recommended ? <em className="mp-badge rec">Recommended</em> : null}
          {entry.badge ? <em className="mp-badge">{entry.badge}</em> : null}
        </span>
        <span className="mp-row-sub">
          {entry.provider} · {entry.note}
        </span>
      </span>
      <span className="mp-row-side">
        <span className={`mp-access ${entry.access}`}>
          {entry.access === "hosted" ? "Free" : entry.access === "local" ? "Local" : "Key"}
        </span>
        {active ? (
          <span className="mp-check" aria-label="Selected">
            <Icon name="check" size={13} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
