"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useProvider } from "@/components/ProviderContext";
import { normalizeBaseUrl } from "@/lib/endpoints";

type Server = {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
};

type Runtime = {
  id: string;
  probeId: string;
  name: string;
  mark: string;
  blurb: string;
  providerBaseUrl: string;
  fallbackModel: string;
  command: string;
  docs: string;
};

const RUNTIMES: Runtime[] = [
  {
    id: "ollama",
    probeId: "ollama",
    name: "Ollama",
    mark: "OL",
    blurb: "The easiest way to run open-weight models on your own machine.",
    providerBaseUrl: "http://localhost:11434/v1",
    fallbackModel: "qwen3:4b",
    command: "ollama pull qwen3:4b",
    docs: "https://ollama.com",
  },
  {
    id: "lmstudio",
    probeId: "lmstudio",
    name: "LM Studio",
    mark: "LM",
    blurb: "A desktop model browser with an OpenAI-compatible local server.",
    providerBaseUrl: "http://localhost:1234/v1",
    fallbackModel: "local-model",
    command: "Start Local Server on port 1234",
    docs: "https://lmstudio.ai",
  },
];

export default function PluginsPage() {
  const router = useRouter();
  const { chooseProvider } = useProvider();
  const [servers, setServers] = useState<Server[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setScanError(null);
    try {
      const response = await fetch("/api/local-models", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not scan local runtimes.");
      const data = (await response.json()) as { servers?: Server[] };
      setServers(Array.isArray(data.servers) ? data.servers : []);
    } catch (caught) {
      setScanError(caught instanceof Error ? caught.message : "Could not scan local runtimes.");
      setServers([]);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    void scan();
  }, []);

  function serverFor(runtime: Runtime): Server | undefined {
    return servers.find((server) => server.id === runtime.probeId);
  }

  function useRuntime(runtime: Runtime) {
    const server = serverFor(runtime);
    chooseProvider({
      baseUrl: normalizeBaseUrl(runtime.providerBaseUrl),
      model: server?.models[0] || runtime.fallbackModel,
      apiKey: "",
      label: runtime.name,
    });
    router.push("/");
  }

  const detected = RUNTIMES.filter((runtime) => serverFor(runtime)).length;

  return (
    <div className="page-scroll plugins-page">
      <div className="page-frame">
        <header className="page-head">
          <span className="page-eyebrow">Plugins</span>
          <div className="page-head-row">
            <div>
              <h1>Ollama or LM Studio.</h1>
              <p>
                Start either local server and it becomes a model choice immediately. No account
                required; nothing leaves your machine.
              </p>
            </div>
            <button
              type="button"
              className="page-refresh"
              onClick={() => void scan()}
              disabled={scanning}
            >
              <Icon name="refresh" size={14} />
              {scanning ? "Scanning…" : "Scan again"}
            </button>
          </div>
        </header>

        <div className="plugins-summary">
          <span className={`status-dot ${detected > 0 ? "live" : "quiet"}`} />
          <strong>
            {scanning
              ? "Looking for local runtimes…"
              : detected > 0
                ? `${detected} runtime${detected === 1 ? "" : "s"} detected`
                : "No local runtimes detected"}
          </strong>
          <span>
            {scanning
              ? "Checking localhost for Ollama and LM Studio."
              : "Start Ollama or LM Studio, then scan again. Nothing leaves your machine."}
          </span>
        </div>

        {scanError ? <p className="page-error">{scanError}</p> : null}

        <div className="runtime-grid">
          {RUNTIMES.map((runtime) => {
            const server = serverFor(runtime);
            return (
              <article
                className={`runtime-card ${server ? "detected" : ""}`}
                key={runtime.id}
              >
                <div className="runtime-card-head">
                  <span className="runtime-mark">{runtime.mark}</span>
                  <div className="runtime-title">
                    <h2>{runtime.name}</h2>
                    <span>OpenAI-compatible local server</span>
                  </div>
                  <span className={`runtime-status ${server ? "on" : ""}`}>
                    <span className="status-dot" />
                    {server ? "Detected" : "Not detected"}
                  </span>
                </div>

                <p className="runtime-blurb">{runtime.blurb}</p>

                <div className="runtime-models">
                  {server?.models.length ? (
                    server.models.slice(0, 4).map((model) => (
                      <span className="runtime-model" key={model}>
                        {model}
                      </span>
                    ))
                  ) : (
                    <span className="runtime-model empty">
                      {scanning ? "Checking…" : "Start the server to see models"}
                    </span>
                  )}
                </div>

                <code className="runtime-command">{runtime.command}</code>

                <div className="runtime-card-foot">
                  <a href={runtime.docs} target="_blank" rel="noreferrer">
                    Docs <Icon name="arrowUpRight" size={12} />
                  </a>
                  <button
                    type="button"
                    className="runtime-use"
                    onClick={() => useRuntime(runtime)}
                    disabled={!server}
                  >
                    Use model <Icon name="arrowRight" size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="plugins-cloud">
          <div>
            <span className="plugins-cloud-icon">
              <Icon name="extensions" size={18} />
            </span>
            <div>
              <strong>Looking for build add-ons?</strong>
              <p>
                Extensions install accessibility, SEO, PWA, motion, chart and launch-page rules
                that Cygnus applies to every build.
              </p>
            </div>
          </div>
          <Link href="/extensions">
            Browse extensions <Icon name="arrowRight" size={13} />
          </Link>
        </div>

        <div className="plugins-cloud">
          <div>
            <span className="plugins-cloud-icon">
              <Icon name="sliders" size={18} />
            </span>
            <div>
              <strong>Prefer hosted or BYOK?</strong>
              <p>
                The composer separates free cloud models, on-device open-source models,
                Ollama or LM Studio, and BYOK providers. Cloud keys live in Settings.
              </p>
            </div>
          </div>
          <Link href="/settings">
            Open Settings <Icon name="arrowRight" size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
