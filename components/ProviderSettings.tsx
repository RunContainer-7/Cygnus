"use client";

import { useEffect, useId, useState } from "react";
import { isLocalEndpoint, normalizeBaseUrl } from "@/lib/endpoints";
import {
  PRESETS,
  isDemo,
  loadProviderKey,
  saveProviderKey,
  type ProviderPreset,
} from "@/lib/providers";
import type { ProviderConfig } from "@/lib/types";

const FREE_PRESETS = PRESETS.filter((preset) => preset.demo);
const CLOUD_PRESETS = PRESETS.filter((preset) => preset.group === "cloud" && !preset.demo);
const LOCAL_PRESETS = PRESETS.filter((preset) => preset.group === "local");

export default function ProviderSettings({
  open,
  onClose,
  provider,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  provider: ProviderConfig;
  onSave: (provider: ProviderConfig) => void;
}) {
  const listId = useId();
  const [tab, setTab] = useState<"models" | "connection">("models");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ProviderConfig>(provider);
  const [revealed, setRevealed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [modelNote, setModelNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const preset = PRESETS.find(
      (item) =>
        item.baseUrl && normalizeBaseUrl(item.baseUrl) === normalizeBaseUrl(provider.baseUrl),
    );
    const requiresKey =
      Boolean(preset?.needsKey) && !preset?.demo && !isLocalEndpoint(provider.baseUrl);
    setTab(requiresKey && !provider.apiKey ? "connection" : "models");
    setQuery("");
    setDraft({
      ...provider,
      apiKey: provider.apiKey || loadProviderKey(provider.baseUrl),
    });
    setTest(null);
    setTesting(false);
    setRevealed(false);
    setModels([]);
    setModelNote(null);
    setFetching(false);
  }, [open, provider]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isDemoDraft = isDemo(draft);
  const isLocalDraft = isLocalEndpoint(draft.baseUrl) && !isDemoDraft;
  const matchedPreset = PRESETS.find(
    (preset) => preset.baseUrl && normalizeBaseUrl(preset.baseUrl) === normalizeBaseUrl(draft.baseUrl),
  );
  const ready = Boolean(draft.baseUrl.trim() && draft.model.trim());
  const needsKey = Boolean(matchedPreset?.needsKey && !isLocalDraft && !isDemoDraft);
  const hasKey = Boolean((draft.apiKey ?? "").trim());

  const matches = (preset: ProviderPreset) =>
    `${preset.label} ${preset.model} ${preset.blurb}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());

  const free = FREE_PRESETS.filter(matches);
  const cloud = CLOUD_PRESETS.filter(matches);
  const local = LOCAL_PRESETS.filter(matches);
  const total = free.length + cloud.length + local.length;

  async function discover(config: ProviderConfig, autoPick: boolean) {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    if (!baseUrl || baseUrl === "demo") return;

    setFetching(true);
    setModelNote(null);
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: config.apiKey }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        models?: string[];
        error?: string;
      };
      if (!response.ok) {
        setModels([]);
        setModelNote({ ok: false, text: data.error ?? "Could not list models." });
        return;
      }
      const list = Array.isArray(data.models) ? data.models : [];
      setModels(list);
      setModelNote({
        ok: true,
        text: `${list.length} model${list.length === 1 ? "" : "s"} found`,
      });
      if (autoPick && list.length > 0) {
        setDraft((previous) =>
          previous.model && list.includes(previous.model)
            ? previous
            : { ...previous, model: list[0] },
        );
      }
    } catch (error) {
      setModelNote({
        ok: false,
        text: error instanceof Error ? error.message : "Could not list models.",
      });
    } finally {
      setFetching(false);
    }
  }

  function choosePreset(preset: ProviderPreset) {
    const apiKey =
      preset.demo || preset.local || preset.custom ? "" : loadProviderKey(preset.baseUrl);
    const next: ProviderConfig = {
      baseUrl: preset.baseUrl,
      model: preset.model,
      apiKey,
      label: preset.label,
    };
    setDraft(next);
    setTest(null);
    setModels([]);
    setModelNote(null);
    if (preset.custom) {
      setTab("connection");
      return;
    }
    if (preset.local) void discover(next, true);
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const response = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: draft.baseUrl,
          model: draft.model,
          apiKey: draft.apiKey,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; detail?: string; error?: string };
      setTest({
        ok: Boolean(data.ok),
        text: data.detail || data.error || "No response from the provider.",
      });
    } catch (error) {
      setTest({
        ok: false,
        text: error instanceof Error ? error.message : "Could not reach the provider.",
      });
    } finally {
      setTesting(false);
    }
  }

  function save() {
    if (!ready) return;
    const baseUrl = normalizeBaseUrl(draft.baseUrl);
    const preset = PRESETS.find((item) => item.baseUrl && normalizeBaseUrl(item.baseUrl) === baseUrl);
    saveProviderKey(baseUrl, draft.apiKey ?? "");
    onSave({
      baseUrl,
      model: draft.model.trim(),
      apiKey: (draft.apiKey ?? "").trim(),
      label: preset?.label ?? draft.label,
    });
    onClose();
  }

  function apply() {
    if (!ready) return;
    if (needsKey && !hasKey) {
      setTab("connection");
      return;
    }
    save();
  }

  function renderRows(items: ProviderPreset[]) {
    return items.map((preset) => {
      const active = preset.custom
        ? !matchedPreset && Boolean(draft.baseUrl)
        : matchedPreset?.id === preset.id;
      const title = preset.custom
        ? "Custom endpoint"
        : preset.local
          ? preset.label
          : preset.model;
      const subtitle = preset.custom
        ? "Any OpenAI-compatible URL and key."
        : preset.local
          ? preset.blurb
          : `${preset.label} · ${preset.blurb}`;

      return (
        <button
          key={preset.id}
          type="button"
          className={`model-row ${active ? "active" : ""}`}
          onClick={() => choosePreset(preset)}
        >
          <span className="model-row-main">
            <span className="model-row-title">{title}</span>
            <span className="model-row-sub">{subtitle}</span>
          </span>
          <span className="model-row-side">
            <span
              className={`model-badge ${preset.demo ? "free" : preset.local || preset.custom ? "local" : "key"}`}
            >
              {preset.demo ? "No key" : preset.local || preset.custom ? "Local" : "API key"}
            </span>
            {active ? (
              <span className="model-check" aria-label="Selected">
                ✓
              </span>
            ) : null}
          </span>
        </button>
      );
    });
  }

  const currentLabel = isDemoDraft
    ? "Offline demo"
    : matchedPreset?.label ?? (draft.label || "Custom endpoint");

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="model-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-settings-title"
      >
        <div className="picker-head">
          <div>
            <h2 id="model-settings-title">Models</h2>
            <p>Choose what writes your app. Bring a key or run a local model.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close models">
            ×
          </button>
        </div>

        <div className="picker-meter">
          <div className="picker-meter-main">
            <strong>No credits. No quotas.</strong>
            <span>Requests go straight to your provider with your key.</span>
          </div>
          <span className="picker-meter-tag">BYOK</span>
        </div>

        <div className="picker-tabs" role="tablist" aria-label="Model settings tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "models"}
            className={tab === "models" ? "active" : ""}
            onClick={() => setTab("models")}
          >
            Models
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "connection"}
            className={tab === "connection" ? "active" : ""}
            onClick={() => setTab("connection")}
          >
            Connection
          </button>
        </div>

        {tab === "models" ? (
          <div className="picker-body">
            <input
              className="picker-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models and providers"
              aria-label="Search models and providers"
              spellCheck={false}
            />

            {total === 0 ? <p className="picker-empty">No models match “{query}”.</p> : null}

            {free.length > 0 ? (
              <>
                <div className="model-group-label">Free</div>
                {renderRows(free)}
              </>
            ) : null}

            {cloud.length > 0 ? (
              <>
                <div className="model-group-label">Cloud</div>
                {renderRows(cloud)}
              </>
            ) : null}

            {local.length > 0 ? (
              <>
                <div className="model-group-label">Local &amp; custom</div>
                {renderRows(local)}
              </>
            ) : null}
          </div>
        ) : (
          <div className="picker-connection">
            <p className="picker-note">
              {matchedPreset
                ? matchedPreset.blurb
                : "Any OpenAI-compatible endpoint works. Bare hosts get https; localhost gets http."}
            </p>

            <label className="field">
              <span className="field-label">Base URL</span>
              <input
                value={draft.baseUrl}
                onChange={(event) => {
                  setDraft({ ...draft, baseUrl: event.target.value });
                  setTest(null);
                  setModelNote(null);
                }}
                onBlur={() =>
                  setDraft((previous) => {
                    const baseUrl = normalizeBaseUrl(previous.baseUrl);
                    return {
                      ...previous,
                      baseUrl,
                      apiKey: previous.apiKey || loadProviderKey(baseUrl),
                    };
                  })
                }
                placeholder="https://api.example.com/v1"
                spellCheck={false}
              />
              <span className="field-hint">
                Base URL or a full …/chat/completions URL. Bare hosts get https, or http for
                localhost.
              </span>
            </label>

            <label className="field">
              <span className="field-label">
                Model
                <button
                  type="button"
                  className="fetch-btn"
                  onClick={() => void discover(draft, false)}
                  disabled={fetching || isDemoDraft || !draft.baseUrl.trim()}
                >
                  {fetching ? "Fetching…" : "Fetch models"}
                </button>
              </span>
              <input
                value={draft.model}
                onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                list={listId}
                placeholder="model id"
                spellCheck={false}
              />
              <datalist id={listId}>
                {models.map((model) => (
                  <option value={model} key={model} />
                ))}
              </datalist>
              <p className={`model-status ${modelNote?.ok ? "ok" : modelNote ? "bad" : ""}`}>
                {modelNote?.text ??
                  (isLocalDraft
                    ? "Local servers list their models automatically."
                    : "Fetch models to list what the endpoint serves.")}
              </p>
            </label>

            {!isDemoDraft ? (
              <label className="field">
                <span className="field-label">
                  API key{isLocalDraft ? " (optional for local)" : ""}
                </span>
                <div className="key-row">
                  <input
                    type={revealed ? "text" : "password"}
                    value={draft.apiKey ?? ""}
                    onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                    placeholder={isLocalDraft ? "not needed locally" : "paste your key"}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setRevealed((value) => !value)}
                    aria-label={revealed ? "Hide API key" : "Show API key"}
                  >
                    {revealed ? "Hide" : "Show"}
                  </button>
                </div>
                <span className="field-hint">
                  Saved for {currentLabel} in this browser only. Never sent to our server disk.
                </span>
              </label>
            ) : (
              <p className="field-hint">The offline demo needs no key and makes no model call.</p>
            )}

            <p className="fineprint">
              Keys stay in this browser. Swap providers without losing each provider&apos;s key.
            </p>

            {test ? <p className={`test-result ${test.ok ? "ok" : "bad"}`}>{test.text}</p> : null}
          </div>
        )}

        <div className="picker-foot">
          <div className="picker-current">
            <span className={`status-dot ${isDemoDraft ? "demo" : "live"}`} />
            <div className="picker-current-text">
              <strong>{currentLabel}</strong>
              <span>{draft.model || "No model yet"}</span>
            </div>
          </div>
          <div className="picker-actions">
            {tab === "connection" ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={runTest}
                disabled={testing || !ready}
              >
                {testing ? "Testing…" : "Test"}
              </button>
            ) : null}
            <button type="button" className="primary-btn" onClick={apply} disabled={!ready}>
              {tab === "models" && needsKey && !hasKey
                ? "Add key"
                : tab === "models"
                  ? "Use model"
                  : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
