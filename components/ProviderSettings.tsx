"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isLocalEndpoint, normalizeBaseUrl } from "@/lib/endpoints";
import { HOSTED_BASE_URL } from "@/lib/hosted";
import {
  PRESETS,
  isDemo,
  loadProviderKey,
  saveProviderKey,
  type ProviderPreset,
} from "@/lib/providers";
import type { ProviderConfig } from "@/lib/types";

const HOSTED_PRESETS = PRESETS.filter((preset) => preset.group === "hosted");
const LOCAL_PRESETS = PRESETS.filter((preset) => preset.group === "local");
const CLOUD_PRESETS = PRESETS.filter((preset) => preset.group === "cloud");
const CUSTOM_PRESETS = PRESETS.filter((preset) => preset.group === "custom");
const DEMO_PRESETS = PRESETS.filter((preset) => preset.group === "demo");

export default function ProviderSettings({
  open,
  embedded = false,
  onClose,
  provider,
  onSave,
}: {
  open: boolean;
  embedded?: boolean;
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
  const discoverToken = useRef(0);

  useEffect(() => {
    if (!open && !embedded) return;
    discoverToken.current += 1;
    const preset = PRESETS.find(
      (item) =>
        item.baseUrl && normalizeBaseUrl(item.baseUrl) === normalizeBaseUrl(provider.baseUrl),
    );
    const requiresKey =
      Boolean(preset?.needsKey) &&
      !preset?.demo &&
      !preset?.hosted &&
      !isLocalEndpoint(provider.baseUrl);
    const savedKey = provider.apiKey || loadProviderKey(provider.baseUrl);
    setTab(requiresKey && !savedKey ? "connection" : "models");
    setQuery("");
    setDraft({
      ...provider,
      apiKey: savedKey,
    });
    setTest(null);
    setTesting(false);
    setRevealed(false);
    setModels([]);
    setModelNote(null);
    setFetching(false);
  }, [open, embedded, provider]);

  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, embedded, onClose]);

  if (!open && !embedded) return null;

  const isDemoDraft = isDemo(draft);
  const isHostedDraft = normalizeBaseUrl(draft.baseUrl) === HOSTED_BASE_URL;
  const isLocalDraft = isLocalEndpoint(draft.baseUrl) && !isDemoDraft;
  const matchedPreset =
    PRESETS.find((preset) => {
      if (!preset.baseUrl || normalizeBaseUrl(preset.baseUrl) !== normalizeBaseUrl(draft.baseUrl)) {
        return false;
      }
      if (preset.label !== draft.label) return false;
      return preset.hosted ? preset.model === draft.model : true;
    }) ??
    PRESETS.find((preset) => {
      if (!preset.baseUrl || normalizeBaseUrl(preset.baseUrl) !== normalizeBaseUrl(draft.baseUrl)) {
        return false;
      }
      return preset.hosted ? preset.model === draft.model : true;
    });
  const ready = Boolean(draft.baseUrl.trim() && draft.model.trim());
  const needsKey = Boolean(
    matchedPreset?.needsKey && !isLocalDraft && !isDemoDraft && !isHostedDraft,
  );
  const hasKey = Boolean((draft.apiKey ?? "").trim());

  const matches = (preset: ProviderPreset) =>
    `${preset.label} ${preset.model} ${preset.blurb}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());

  const hosted = HOSTED_PRESETS.filter(matches);
  const local = LOCAL_PRESETS.filter(matches);
  const cloud = CLOUD_PRESETS.filter(matches);
  const custom = CUSTOM_PRESETS.filter(matches);
  const demo = DEMO_PRESETS.filter(matches);
  const total = hosted.length + local.length + cloud.length + custom.length + demo.length;

  async function discover(config: ProviderConfig, autoPick: boolean) {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    if (!baseUrl || baseUrl === "demo") return;

    const token = ++discoverToken.current;
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
      if (token !== discoverToken.current) return;
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
          token === discoverToken.current &&
          !(previous.model && list.includes(previous.model))
            ? { ...previous, model: list[0] }
            : previous,
        );
      }
    } catch (error) {
      if (token !== discoverToken.current) return;
      setModelNote({
        ok: false,
        text: error instanceof Error ? error.message : "Could not list models.",
      });
    } finally {
      if (token === discoverToken.current) setFetching(false);
    }
  }

  function choosePreset(preset: ProviderPreset) {
    discoverToken.current += 1;
    setFetching(false);
    const apiKey =
      preset.demo || preset.hosted || preset.local || preset.custom
        ? ""
        : loadProviderKey(preset.baseUrl);
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
    const preset =
      PRESETS.find(
        (item) =>
          item.baseUrl &&
          normalizeBaseUrl(item.baseUrl) === baseUrl &&
          item.label === draft.label,
      ) ??
      PRESETS.find(
        (item) =>
          item.baseUrl &&
          normalizeBaseUrl(item.baseUrl) === baseUrl &&
          (item.hosted ? item.model === draft.model : true),
      );
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
        ? (!matchedPreset || matchedPreset.custom) && Boolean(draft.baseUrl)
        : matchedPreset?.id === preset.id;
      const title = preset.custom
        ? "Custom endpoint"
        : preset.hosted || preset.local
          ? preset.label
          : preset.model;
      const subtitle = preset.custom
        ? "Any OpenAI-compatible URL and key."
        : preset.hosted
          ? `Free · ${preset.blurb}`
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
              className={`model-badge ${
                preset.demo || preset.hosted
                  ? "free"
                  : preset.local || preset.custom
                    ? "local"
                    : "key"
              }`}
            >
              {preset.demo
                ? "No key"
                : preset.hosted
                  ? "Hosted"
                  : preset.custom
                    ? "Custom"
                    : preset.local
                      ? "Local"
                      : "API key"}
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

  const panel = (
      <div
        className={`model-panel ${embedded ? "embedded" : ""}`}
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label={embedded ? "Models and connections" : undefined}
        aria-labelledby={embedded ? undefined : "model-settings-title"}
      >
        <div className="picker-head">
          <div>
            <h2 id="model-settings-title">Models</h2>
            <p>Choose hosted (no key), local (private), or connect a BYOK cloud provider.</p>
          </div>
          {!embedded ? (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close models">
              ×
            </button>
          ) : null}
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

            {hosted.length > 0 ? (
              <>
                <div className="model-group-label">Hosted · no key</div>
                {renderRows(hosted)}
              </>
            ) : null}

            {local.length > 0 ? (
              <>
                <div className="model-group-label">Local runtimes · no key</div>
                {renderRows(local)}
              </>
            ) : null}

            {cloud.length > 0 ? (
              <>
                <div className="model-group-label">BYOK cloud · API key</div>
                {renderRows(cloud)}
              </>
            ) : null}

            {custom.length > 0 ? (
              <>
                <div className="model-group-label">Custom endpoint</div>
                {renderRows(custom)}
              </>
            ) : null}

            {demo.length > 0 ? (
              <>
                <div className="model-group-label">Offline demo</div>
                {renderRows(demo)}
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

            {isHostedDraft ? (
              <div className="hosted-connection-note">
                <strong>No connection setup needed.</strong>
                <p>
                  Hosted models use shared free capacity. No key is used, and prompts may be
                  logged by the upstream provider. Use Local for private code.
                </p>
              </div>
            ) : null}

            <label className="field">
              <span className="field-label">Base URL</span>
              <input
                value={draft.baseUrl}
                onChange={(event) => {
                  discoverToken.current += 1;
                  setFetching(false);
                  setModels([]);
                  setDraft({ ...draft, baseUrl: event.target.value });
                  setTest(null);
                  setModelNote(null);
                }}
                onBlur={() =>
                  setDraft((previous) => {
                    const baseUrl = normalizeBaseUrl(previous.baseUrl);
                    const matchingPreset =
                      PRESETS.find(
                        (item) =>
                          item.baseUrl &&
                          normalizeBaseUrl(item.baseUrl) === baseUrl &&
                          item.label === previous.label,
                      ) ??
                      PRESETS.find(
                        (item) => item.baseUrl && normalizeBaseUrl(item.baseUrl) === baseUrl,
                      );
                    return {
                      ...previous,
                      baseUrl,
                      label: baseUrl
                        ? (matchingPreset?.label ?? "Custom endpoint")
                        : previous.label,
                      apiKey: previous.apiKey || loadProviderKey(baseUrl),
                    };
                  })
                }
                placeholder="https://api.example.com/v1"
                spellCheck={false}
                disabled={isHostedDraft}
              />
              <span className="field-hint">
                {isHostedDraft
                  ? "Hosted models are selected from the Models list. No endpoint or key is required."
                  : "Base URL or a full …/chat/completions URL. Bare hosts get https, or http for localhost."}
              </span>
            </label>

            <label className="field">
              <span className="field-label">
                Model
                {!isHostedDraft ? (
                  <button
                    type="button"
                    className="fetch-btn"
                    onClick={() => void discover(draft, false)}
                    disabled={fetching || isDemoDraft || !draft.baseUrl.trim()}
                  >
                    {fetching ? "Fetching…" : "Fetch models"}
                  </button>
                ) : null}
              </span>
              <input
                value={draft.model}
                onChange={(event) => {
                  setDraft({ ...draft, model: event.target.value });
                  setTest(null);
                }}
                list={listId}
                placeholder="model id"
                spellCheck={false}
                disabled={isHostedDraft}
              />
              <datalist id={listId}>
                {models.map((model) => (
                  <option value={model} key={model} />
                ))}
              </datalist>
              <p className={`model-status ${modelNote?.ok ? "ok" : modelNote ? "bad" : ""}`}>
                {modelNote?.text ??
                  (isHostedDraft
                    ? "Hosted models use shared free capacity and may log prompts upstream."
                    : isLocalDraft
                      ? "Local servers list their models automatically."
                      : "Fetch models to list what the endpoint serves.")}
              </p>
            </label>

            {!isDemoDraft && !isHostedDraft ? (
              <label className="field">
                <span className="field-label">
                  API key{isLocalDraft ? " (optional for local)" : ""}
                </span>
                <div className="key-row">
                  <input
                    type={revealed ? "text" : "password"}
                    value={draft.apiKey ?? ""}
                    onChange={(event) => {
                      setDraft({ ...draft, apiKey: event.target.value });
                      setTest(null);
                    }}
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
            ) : isHostedDraft ? (
              <p className="field-hint">
                No API key is needed for hosted models. Use Local for private projects.
              </p>
            ) : (
              <p className="field-hint">The offline demo needs no key and makes no model call.</p>
            )}

            <p className="fineprint">
              {isHostedDraft
                ? "Hosted models may log prompts upstream. Local models never leave this machine."
                : "Keys stay in this browser. Swap providers without losing each provider's key."}
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
  );

  if (embedded) return <div className="settings-embed">{panel}</div>;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {panel}
    </div>
  );
}
