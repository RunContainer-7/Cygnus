"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useProvider } from "./ProviderContext";
import { isLocalEndpoint, normalizeBaseUrl } from "@/lib/endpoints";
import { CYGNUS_LOCAL_BASE_URL, isCygnusLocalProvider } from "@/lib/cygnus05Shared";
import { HOSTED_BASE_URL } from "@/lib/hosted";
import {
  MODEL_TIERS,
  OPEN_SOURCE_MODELS,
  type OpenModel,
} from "@/lib/modelCatalog";
import {
  formatRamGb,
  type OpenSourceEvent,
  type OpenSourceStatus,
} from "@/lib/openSource";
import {
  isDemo,
  loadProviderKey,
  providerLabel,
  saveProviderKey,
} from "@/lib/providers";

type MenuTab = "open" | "local" | "byok";

type ByokResult = {
  provider: string;
  baseUrl: string;
  model: string;
  modelCount: number;
};

const ACCESS_TABS: Array<{ id: MenuTab; label: string; sub: string }> = [
  { id: "open", label: "Open source", sub: "On this PC" },
  { id: "local", label: "Local", sub: "Ollama · LM Studio" },
  { id: "byok", label: "BYOK", sub: "One key" },
];

const TIER_ORDER = { low: 0, balanced: 1, max: 2 } as const;
const KIND_ORDER: Record<NonNullable<OpenModel["kind"]>, number> = {
  agent: 0,
  chat: 1,
  ocr: 2,
};

type TaskState = {
  id: string;
  phase: "engine" | "model";
  percent: number | null;
  status: string;
};

function accessForProvider(provider: { baseUrl: string; model: string }): MenuTab {
  if (isCygnusLocalProvider(provider)) return "open";
  if (normalizeBaseUrl(provider.baseUrl) === HOSTED_BASE_URL || isDemo(provider)) return "open";
  if (
    OPEN_SOURCE_MODELS.some(
      (entry) => entry.access === "open" && entry.model === provider.model,
    )
  ) {
    return "open";
  }
  if (isLocalEndpoint(provider.baseUrl)) return "local";
  return "byok";
}

function tierLabel(entry: OpenModel): string {
  return MODEL_TIERS.find((item) => item.id === entry.tier)?.label ?? "Balanced";
}

function normalizeModelName(value: string): string {
  return value.trim().toLowerCase();
}

export default function ModelMenu({
  onClose,
  onManage,
}: {
  onClose: () => void;
  onManage: () => void;
}) {
  const { provider, chooseProvider } = useProvider();
  const [access, setAccess] = useState<MenuTab>(accessForProvider(provider));
  const [detecting, setDetecting] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<OpenSourceStatus | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineLoading, setEngineLoading] = useState(true);
  const [task, setTask] = useState<TaskState | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const choiceToken = useRef(0);

  const counts = useMemo<Record<MenuTab, number>>(() => {
    return OPEN_SOURCE_MODELS.reduce(
      (result, entry) => {
        if (entry.access === "hosted" || entry.access === "open" || entry.access === "cygnus") {
          result.open += 1;
        } else if (entry.access === "local") result.local += 1;
        return result;
      },
      { open: 0, local: 0, byok: 0 },
    );
  }, []);

  const visible = useMemo(() => {
    return OPEN_SOURCE_MODELS.filter((entry) =>
      access === "open"
        ? entry.access === "hosted" || entry.access === "open" || entry.access === "cygnus"
        : entry.access === access,
    ).sort(
      (left, right) =>
        Number(Boolean(right.recommended)) - Number(Boolean(left.recommended)) ||
        KIND_ORDER[left.kind ?? "agent"] - KIND_ORDER[right.kind ?? "agent"] ||
        TIER_ORDER[left.tier] - TIER_ORDER[right.tier] ||
        left.name.localeCompare(right.name),
    );
  }, [access]);

  const installedTags = useMemo(() => {
    return new Set((engineStatus?.models ?? []).map(normalizeModelName));
  }, [engineStatus]);

  useEffect(() => {
    dialogRef.current?.focus();
    return () => {
      choiceToken.current += 1;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEngineLoading(true);
    fetch("/api/opensource", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | OpenSourceStatus
          | { error?: string }
          | null;
        if (!response.ok || !data || !("engine" in data)) {
          throw new Error(
            (data && "error" in data && data.error) || "Could not check the local engine.",
          );
        }
        if (!cancelled) {
          setEngineStatus(data);
          setEngineError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEngineError(
            error instanceof Error ? error.message : "Could not check the local engine.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setEngineLoading(false);
      });
    return () => {
      cancelled = true;
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

  function connectByok(apiKey: string, result: ByokResult) {
    const baseUrl = normalizeBaseUrl(result.baseUrl);
    saveProviderKey(baseUrl, apiKey);
    chooseProvider({
      baseUrl,
      model: result.model,
      apiKey,
      label: result.provider,
    });
  }

  async function choose(entry: OpenModel) {
    const token = ++choiceToken.current;
    if (entry.access === "cygnus") {
      chooseProvider({
        baseUrl: CYGNUS_LOCAL_BASE_URL,
        model: entry.model,
        apiKey: "",
        label: entry.name,
      });
      onClose();
      return;
    }
    const baseUrl = normalizeBaseUrl(entry.baseUrl);
    const apiKey = entry.access === "byok" ? loadProviderKey(baseUrl) : "";

    if (entry.access === "open") {
      await prepareOpenModel(entry, token);
      return;
    }

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
        const models = Array.isArray(data.models) ? data.models : [];
        if (models.length === 0) {
          throw new Error(
            entry.provider === "Ollama"
              ? "Ollama is running but has no models. Pull one with `ollama pull qwen3:4b`."
              : "LM Studio is not serving a model. Load one and start the local server.",
          );
        }
        const preferred =
          entry.provider === "Ollama"
            ? [
                "qwen3:4b",
                "qwen3:8b",
                "llama3.1:8b",
                "granite4:micro",
                "phi4-mini:3.8b",
                "deepseek-r1:7b",
              ]
            : [];
        const first = preferred.find((model) => models.includes(model)) ?? models[0];
        chooseProvider({ baseUrl, model: first, apiKey: "", label: entry.provider });
        onClose();
      } catch (error) {
        if (token !== choiceToken.current) return;
        setDiscoveryError(
          `${entry.provider}: ${
            error instanceof Error ? error.message : "Could not reach the server."
          }`,
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

  async function prepareOpenModel(entry: OpenModel, token: number) {
    if (!entry.tag) return;

    if (entry.kind && entry.kind !== "agent") {
      setDiscoveryError(
        `${entry.name} is ${
          entry.kind === "ocr" ? "an OCR model" : "a chat-only model"
        } and cannot build apps.`,
      );
      return;
    }

    const totalRamGb = engineStatus?.totalRamGb ?? 0;
    if (totalRamGb > 0 && entry.minRamGb && totalRamGb < entry.minRamGb) {
      setDiscoveryError(
        `${entry.name} needs about ${entry.minRamGb} GB of RAM. This PC has ${formatRamGb(
          totalRamGb,
        )}. Pick a smaller model or use BYOK.`,
      );
      return;
    }

    setTask({
      id: entry.id,
      phase: "engine",
      percent: null,
      status: `Preparing ${entry.name}`,
    });
    setDiscoveryError(null);

    try {
      const response = await fetch("/api/opensource", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id.replace(/^open-/, "") }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Could not prepare ${entry.name}.`);
      }
      if (!response.body) throw new Error("The local engine returned no progress stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let prepared: { baseUrl: string; model: string } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;

          let event: OpenSourceEvent;
          try {
            event = JSON.parse(line) as OpenSourceEvent;
          } catch {
            continue;
          }
          if (token !== choiceToken.current) return;

          if (event.type === "progress") {
            setTask({
              id: entry.id,
              phase: event.phase,
              percent: event.percent,
              status: event.status,
            });
          } else if (event.type === "done") {
            prepared = { baseUrl: event.baseUrl, model: event.model };
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (!prepared) throw new Error(`${entry.name} did not finish preparing.`);
      if (token !== choiceToken.current) return;

      setEngineStatus((previous) =>
        previous && !previous.models.includes(prepared!.model)
          ? { ...previous, models: [...previous.models, prepared!.model] }
          : previous,
      );
      setTask(null);
      chooseProvider({
        baseUrl: prepared.baseUrl,
        model: prepared.model,
        apiKey: "",
        label: entry.name,
      });
      onClose();
    } catch (error) {
      if (token !== choiceToken.current) return;
      setTask(null);
      setDiscoveryError(
        error instanceof Error ? error.message : `Could not prepare ${entry.name}.`,
      );
    }
  }

  if (typeof document === "undefined") return null;

  const hostedEntries = visible.filter((entry) => entry.access === "hosted");
  const cygnusEntries = visible.filter((entry) => entry.access === "cygnus");
  const onDeviceEntries = visible.filter((entry) => entry.access === "open");
  const totalRamGb = engineStatus?.totalRamGb ?? 0;

  const renderRow = (entry: OpenModel) => {
    const active =
      entry.access === "cygnus"
        ? provider.baseUrl === CYGNUS_LOCAL_BASE_URL && entry.model === provider.model
        : entry.access === "open"
          ? isLocalEndpoint(provider.baseUrl) && entry.model === provider.model
          : entry.access === "local"
            ? normalizeBaseUrl(entry.baseUrl) === normalizeBaseUrl(provider.baseUrl)
            : entry.model === provider.model &&
              normalizeBaseUrl(entry.baseUrl) === normalizeBaseUrl(provider.baseUrl);
    const hasKey =
      entry.access === "byok" ? Boolean(loadProviderKey(entry.baseUrl)) : false;
    const capabilityBlocked =
      entry.access === "open" && Boolean(entry.kind && entry.kind !== "agent");
    const ramBlocked =
      entry.access === "open" &&
      totalRamGb > 0 &&
      Boolean(entry.minRamGb) &&
      totalRamGb < (entry.minRamGb ?? 0);
    const blocked = capabilityBlocked || ramBlocked;
    const blockLabel = capabilityBlocked
      ? entry.kind === "ocr"
        ? "OCR only"
        : "No tools"
      : ramBlocked
        ? `Needs ${entry.minRamGb} GB`
        : null;
    const blockTitle = capabilityBlocked
      ? entry.note
      : ramBlocked
        ? `Needs about ${entry.minRamGb} GB of RAM`
        : undefined;
    const installed =
      entry.access === "cygnus" ||
      (entry.access === "open" &&
        Boolean(entry.tag) &&
        installedTags.has(normalizeModelName(entry.tag!)));
    const rowTask = task?.id === entry.id ? task : null;

    return (
      <ModelRow
        key={entry.id}
        entry={entry}
        active={active}
        hasKey={hasKey}
        blocked={blocked}
        blockLabel={blockLabel}
        blockTitle={blockTitle}
        installed={installed}
        busy={Boolean(rowTask) || detecting === entry.id}
        task={rowTask}
        onChoose={() => void choose(entry)}
      />
    );
  };

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
                {item.id === "byok" ? null : (
                  <span className="mp-access-count">{counts[item.id]}</span>
                )}
              </span>
              <span className="mp-access-sub">{item.sub}</span>
            </button>
          ))}
        </div>

        <div className="mp-scroll" role="tabpanel" aria-label="Model options">
          {access === "open" ? (
            <>
              {hostedEntries.length > 0 ? (
                <>
                  <div className="mp-group-label">Free cloud · no key</div>
                  {hostedEntries.map(renderRow)}
                </>
              ) : null}

              {cygnusEntries.length > 0 ? (
                <>
                  <div className="mp-group-label">Cygnus Labs · experimental</div>
                  {cygnusEntries.map(renderRow)}
                  <p className="mp-engine-note">
                    Trained from scratch on this machine. Chat only, not an app builder, and not
                    recommended for real work.
                  </p>
                </>
              ) : null}

              {onDeviceEntries.length > 0 ? (
                <>
                  <div className="mp-group-label">On this PC · uses your CPU/GPU</div>
                  {onDeviceEntries.map(renderRow)}
                  <p className="mp-engine-note">
                    {engineLoading
                      ? "Checking the local engine…"
                      : engineError
                        ? "Local engine unavailable."
                        : engineStatus?.engine.installed
                          ? "Local engine ready. First use of a model downloads it."
                          : "First use installs a one-time local engine (~1.5 GB). Models run on this PC; nothing leaves it."}
                  </p>
                  {engineError ? (
                    <p className="mp-error" role="alert">
                      {engineError}
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : access === "local" ? (
            <>
              <div className="mp-group-label">Connect a local runtime</div>
              {visible.map(renderRow)}
              <p className="mp-engine-note">
                Cygnus uses the model already loaded in Ollama or LM Studio. No model
                downloads here.
              </p>
            </>
          ) : (
            <ByokPanel onConnect={connectByok} onClose={onClose} />
          )}
        </div>

        {discoveryError ? (
          <p className="mp-error" role="alert">
            {discoveryError}
          </p>
        ) : null}

        <footer className="mp-foot">
          <span>
            {access === "open"
              ? "Free cloud may log prompts · on-device stays private"
              : access === "local"
                ? "Ollama or LM Studio · private"
                : "One key · provider detected automatically"}
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

function ByokPanel({
  onConnect,
  onClose,
}: {
  onConnect: (apiKey: string, result: ByokResult) => void;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ByokResult | null>(null);

  async function readKey() {
    const key = apiKey.trim();
    if (!key) {
      setError("Paste an API key first.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        provider?: string;
        baseUrl?: string;
        model?: string;
        modelCount?: number;
        error?: string;
      };
      if (!response.ok || !data.provider || !data.baseUrl || !data.model) {
        throw new Error(data.error ?? "Could not read that key.");
      }

      const detected: ByokResult = {
        provider: data.provider,
        baseUrl: data.baseUrl,
        model: data.model,
        modelCount: data.modelCount ?? 0,
      };
      onConnect(key, detected);
      setResult(detected);
      setApiKey("");
      setRevealed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mp-byok"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void readKey();
      }}
    >
      <p className="mp-byok-lead">
        Paste one API key. Cygnus detects the provider and switches to a good coding
        model for it.
      </p>

      <label className="mp-byok-field">
        <span>API key</span>
        <div className="mp-byok-input">
          <input
            type={revealed ? "text" : "password"}
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setError(null);
            }}
            placeholder="sk-…  ·  gsk_…  ·  AIza…"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            aria-label="API key"
          />
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Hide API key" : "Show API key"}
          >
            {revealed ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <button type="submit" className="mp-byok-submit" disabled={busy || !apiKey.trim()}>
        {busy ? "Reading key…" : "Read key & use model"}
      </button>

      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mp-byok-result">
          <div className="mp-byok-result-head">
            <span className="mp-ready">Connected</span>
            <strong>{result.provider}</strong>
          </div>
          <code>{result.model}</code>
          <p>
            {result.modelCount > 0
              ? `${result.modelCount} models available. `
              : ""}
            This is now the active model.
          </p>
          <button type="button" className="mp-byok-done" onClick={onClose}>
            Done
          </button>
        </div>
      ) : null}

      <p className="mp-byok-note">
        OpenAI, OpenRouter, Anthropic, Groq, Google, DeepSeek, Together, and Cerebras.
        The key is saved in this browser and sent only to that provider. For another
        host, use Settings → Custom endpoint.
      </p>
    </form>
  );
}

function ModelRow({
  entry,
  active,
  hasKey,
  blocked,
  blockLabel,
  blockTitle,
  installed,
  busy,
  task,
  onChoose,
}: {
  entry: OpenModel;
  active: boolean;
  hasKey: boolean;
  blocked: boolean;
  blockLabel: string | null;
  blockTitle?: string;
  installed: boolean;
  busy: boolean;
  task: TaskState | null;
  onChoose: () => void;
}) {
  const needsKey = entry.access === "byok" && !hasKey;
  const subtitle =
    entry.access === "hosted"
      ? entry.note
      : entry.access === "open"
        ? `${entry.family ?? "Open"} · ${entry.size ?? "local"} · ${entry.note}`
        : entry.access === "cygnus"
          ? `${entry.family ?? "Cygnus"} · ${entry.size ?? "local"} · ${entry.note}`
          : `${entry.provider} · ${entry.note}`;

  return (
    <button
      type="button"
      className={`mp-row ${active ? "active" : ""}`}
      onClick={onChoose}
      aria-pressed={active}
      aria-busy={busy}
      disabled={busy || blocked}
      title={blockTitle}
    >
      <span className="mp-row-main">
        <span className="mp-row-title">
          {entry.name}
          {entry.recommended ? <em className="mp-badge rec">Recommended</em> : null}
          {entry.badge ? <em className="mp-badge">{entry.badge}</em> : null}
          {entry.access !== "local" ? (
            <em className={`mp-tier-pill ${entry.tier}`}>{tierLabel(entry)}</em>
          ) : null}
        </span>
        <span className="mp-row-sub">{task ? task.status : subtitle}</span>
        {task ? (
          <span className={`mp-progress ${task.percent === null ? "indeterminate" : ""}`}>
            <span style={task.percent === null ? undefined : { width: `${task.percent}%` }} />
          </span>
        ) : null}
      </span>
      <span className="mp-row-side">
        {busy ? (
          <span className="mp-task-pct">
            {task?.percent === null || task?.percent === undefined ? "…" : `${task.percent}%`}
          </span>
        ) : null}
        {!busy && blocked ? <span className="mp-key-hint warn">{blockLabel}</span> : null}
        {!busy && !blocked && entry.access === "open" && installed ? (
          <span className="mp-ready">Ready</span>
        ) : null}
        {!busy && !blocked && entry.access === "open" && !installed ? (
          <span className="mp-key-hint">Download</span>
        ) : null}
        {!busy && !blocked && entry.access === "cygnus" ? (
          <span className="mp-key-hint">Chat only</span>
        ) : null}
        {!busy && !blocked && entry.access === "local" ? (
          <span className="mp-key-hint">Connect</span>
        ) : null}
        {!busy && !blocked && needsKey ? <span className="mp-key-hint">Add key</span> : null}
        {active ? (
          <span className="mp-check" aria-label="Selected">
            <Icon name="check" size={13} />
          </span>
        ) : null}
      </span>
    </button>
  );
}
