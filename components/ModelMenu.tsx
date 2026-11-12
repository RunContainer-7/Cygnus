"use client";

import { useEffect, useState } from "react";
import { useProvider } from "./ProviderContext";
import { normalizeBaseUrl } from "@/lib/endpoints";
import { PRESETS, loadProviderKey, type ProviderPreset } from "@/lib/providers";

const OPEN_SOURCE_IDS = new Set(["groq", "deepseek", "together", "cerebras"]);

type LocalServer = {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
};

export default function ModelMenu({
  onClose,
  onManage,
  placement = "up",
}: {
  onClose: () => void;
  onManage: () => void;
  placement?: "up" | "down";
}) {
  const { provider, chooseProvider } = useProvider();
  const [query, setQuery] = useState("");
  const [scan, setScan] = useState<{
    loading: boolean;
    done: boolean;
    servers: LocalServer[];
  }>({ loading: false, done: false, servers: [] });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = (preset: ProviderPreset) =>
    `${preset.label} ${preset.model} ${preset.blurb}`.toLowerCase().includes(query.trim().toLowerCase());

  const local = PRESETS.filter((preset) => preset.group === "local" && !preset.custom).filter(matches);
  const open = PRESETS.filter((preset) => OPEN_SOURCE_IDS.has(preset.id)).filter(matches);
  const cloud = PRESETS.filter(
    (preset) => preset.group === "cloud" && !preset.demo && !preset.free && !OPEN_SOURCE_IDS.has(preset.id),
  ).filter(matches);
  const free = PRESETS.filter((preset) => preset.demo).filter(matches);

  function pick(preset: ProviderPreset) {
    const baseUrl = normalizeBaseUrl(preset.baseUrl);
    const apiKey =
      preset.demo || preset.local || preset.free || preset.custom
        ? ""
        : loadProviderKey(baseUrl);
    const config = { baseUrl, model: preset.model, apiKey, label: preset.label };
    chooseProvider(config);

    if (preset.custom || (preset.needsKey && !apiKey)) {
      onClose();
      onManage();
      return;
    }

    if (preset.local && !preset.demo) {
      fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { models?: string[] } | null) => {
          const first = data?.models?.[0];
          if (first) chooseProvider({ ...config, model: first });
        })
        .catch(() => undefined);
    }

    onClose();
  }

  async function scanLocal() {
    setScan((previous) => ({ ...previous, loading: true }));
    try {
      const response = await fetch("/api/local-models", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { servers?: LocalServer[] };
      setScan({
        loading: false,
        done: true,
        servers: Array.isArray(data.servers) ? data.servers : [],
      });
    } catch {
      setScan({ loading: false, done: true, servers: [] });
    }
  }

  function chooseLocal(server: LocalServer, model: string) {
    chooseProvider({
      baseUrl: server.baseUrl,
      model,
      apiKey: "",
      label: server.label,
    });
    onClose();
  }

  function row(preset: ProviderPreset) {
    const active =
      normalizeBaseUrl(provider.baseUrl) === normalizeBaseUrl(preset.baseUrl) &&
      provider.model === preset.model;
    const title = preset.local || preset.custom ? preset.label : preset.model;
    const subtitle =
      preset.local || preset.custom ? preset.blurb : `${preset.label} · ${preset.blurb}`;

    return (
      <button
        key={preset.id}
        type="button"
        className={`mm-row ${active ? "active" : ""}`}
        onClick={() => pick(preset)}
      >
        <span className="mm-main">
          <span className="mm-title">{title}</span>
          <span className="mm-sub">{subtitle}</span>
        </span>
        <span
          className={`mm-badge ${
            preset.demo || preset.free ? "free" : preset.local || preset.custom ? "local" : "key"
          }`}
        >
          {preset.demo || preset.free ? "No key" : preset.local || preset.custom ? "Local" : "API key"}
        </span>
        {active ? <span className="mm-check">✓</span> : null}
      </button>
    );
  }

  const total = local.length + open.length + cloud.length + free.length;

  return (
    <>
      <button
        type="button"
        className="menu-scrim"
        aria-label="Close model picker"
        onClick={onClose}
      />
      <div className={`model-menu ${placement}`} role="dialog" aria-label="Choose a model">
        <div className="mm-head">
          <div>
            <strong>Model</strong>
            <span>Local models need no key. Keys stay in your browser.</span>
          </div>
          <button type="button" className="mm-manage" onClick={onManage}>
            Manage
          </button>
        </div>

        <input
          className="mm-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search models…"
          aria-label="Search models"
          spellCheck={false}
          autoFocus
        />

        <div className="mm-list">
          {total === 0 ? <p className="mm-empty">No models match “{query}”.</p> : null}

          {local.length > 0 ? <div className="mm-label">Local · no key</div> : null}
          <div className="mm-scanline">
            <button
              type="button"
              className="mm-scan"
              onClick={() => void scanLocal()}
              disabled={scan.loading}
            >
              {scan.loading ? "Scanning…" : "Scan this machine"}
            </button>
            {scan.done && scan.servers.length === 0 ? (
              <span>No local servers found</span>
            ) : null}
          </div>
          {local.map(row)}
          {scan.servers.map((server) =>
            server.models.length === 0 ? (
              <p className="mm-scan-note" key={`${server.id}-${server.baseUrl}`}>
                {server.label} is running, but has no models loaded.
              </p>
            ) : (
              server.models.slice(0, 4).map((model) => (
                <button
                  key={`${server.id}-${model}`}
                  type="button"
                  className="mm-row"
                  onClick={() => chooseLocal(server, model)}
                >
                  <span className="mm-main">
                    <span className="mm-title">{model}</span>
                    <span className="mm-sub">{server.label} · running locally</span>
                  </span>
                  <span className="mm-badge local">Local</span>
                </button>
              ))
            ),
          )}
          {scan.done && scan.servers.some((server) => server.models.length === 0) ? (
            <p className="mm-scan-note">
              Pull a tool-capable model: <code>ollama pull qwen3.5:4b</code>
            </p>
          ) : null}

          {open.length > 0 ? <div className="mm-label">Open source · API key</div> : null}
          {open.map(row)}

          {cloud.length > 0 ? <div className="mm-label">Cloud · API key</div> : null}
          {cloud.map(row)}

          {free.length > 0 ? <div className="mm-label">Offline demo</div> : null}
          {free.map(row)}
        </div>

        <div className="mm-foot">
          <span>Free + local need no key</span>
          <button type="button" onClick={onManage}>
            All models ↗
          </button>
        </div>
      </div>
    </>
  );
}
