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
    fallbackModel: "qwen2.5-coder:7b",
    command: "ollama pull qwen2.5-coder:7b",
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
  {
    id: "vllm",
    probeId: "vllm",
    name: "vLLM",
    mark: "vL",
    blurb: "High-throughput serving for larger GPUs and multi-user setups.",
    providerBaseUrl: "http://localhost:8000/v1",
    fallbackModel: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    command: "vllm serve Qwen/Qwen3-Coder-30B-A3B-Instruct",
    docs: "https://docs.vllm.ai",
  },
  {
    id: "llamacpp",
    probeId: "llamacpp",
    name: "llama.cpp",
    mark: "++",
    blurb: "Run a single GGUF file with almost no framework overhead.",
    providerBaseUrl: "http://localhost:8080/v1",
    fallbackModel: "local-model",
    command: "llama-server -m model.gguf --port 8080",
    docs: "https://github.com/ggml-org/llama.cpp",
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
              <h1>Bring your own runtime.</h1>
              <p>
                Cygnus talks to OpenAI-compatible local servers. Start one and it becomes a
                model choice immediately — no account required.
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
              ? "Checking the usual localhost ports."
              : "Start a server, then scan again. Nothing leaves your machine."}
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
              <Icon name="sliders" size={18} />
            </span>
            <div>
              <strong>Prefer a hosted API?</strong>
              <p>
                Cloud providers and keys are still available in Settings. The composer
                picker stays open-source only.
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
