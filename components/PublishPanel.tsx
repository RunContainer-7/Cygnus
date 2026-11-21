"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

type Connection = {
  connected: boolean;
  accountName?: string;
  accountId?: string;
};

type Published = {
  provider: string;
  projectName: string;
  url: string;
  deployedAt: string;
};

type Progress = {
  percent: number | null;
  status: string;
};

export default function PublishPanel({
  projectId,
  published,
  onClose,
  onPublished,
}: {
  projectId: string;
  published: Published | null;
  onClose: () => void;
  onPublished: () => void | Promise<void>;
}) {
  const [connection, setConnection] = useState<Connection>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"connect" | "publish" | "offline" | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/publish", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { connection?: Connection }) => {
        if (alive && data.connection) setConnection(data.connection);
      })
      .catch(() => {
        if (alive) setError("Could not check the publishing connection.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function connect() {
    const value = token.trim();
    if (!value || busy) return;
    setBusy("connect");
    setError(null);
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        connection?: Connection;
        error?: string;
      };
      if (!response.ok || !data.connection) {
        throw new Error(data.error ?? "Cloudflare rejected that token.");
      }
      setConnection(data.connection);
      setToken("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect Cloudflare.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (busy) return;
    setBusy("publish");
    setError(null);
    setProgress({ percent: 0, status: "Starting" });

    try {
      const response = await fetch("/api/publish/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not start publishing.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (event.type === "progress") {
            setProgress({
              percent: typeof event.percent === "number" ? event.percent : null,
              status: typeof event.status === "string" ? event.status : "Working",
            });
          } else if (event.type === "done") {
            setProgress({ percent: 100, status: "Live" });
            await onPublished();
          } else if (event.type === "error") {
            throw new Error(String(event.message ?? "Publishing failed."));
          }
        }
      }
    } catch (caught) {
      setProgress(null);
      setError(caught instanceof Error ? caught.message : "Publishing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function takeOffline() {
    if (busy) return;
    setBusy("offline");
    setError(null);
    try {
      const response = await fetch(`/api/publish/deploy?projectId=${projectId}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not take that site offline.");
      await onPublished();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not take that site offline.");
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="publish-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="publish-panel" role="dialog" aria-modal="true" aria-label="Publish app">
        <header className="publish-head">
          <div>
            <span className="publish-eyebrow">Publish</span>
            <h2>Put this app on the web</h2>
            <p>
              Free static hosting in your own Cloudflare account. Cygnus uploads the files
              straight to Cloudflare — no server in between.
            </p>
          </div>
          <button
            type="button"
            className="publish-close"
            onClick={onClose}
            disabled={Boolean(busy)}
            aria-label="Close publish"
          >
            <Icon name="close" size={17} />
          </button>
        </header>

        {loading ? <p className="publish-muted">Checking your connection…</p> : null}

        {!loading && !connection.connected ? (
          <form
            className="publish-connect"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <label className="publish-field">
              <span>Cloudflare API token</span>
              <input
                type="password"
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setError(null);
                }}
                placeholder="paste a token with Pages:Edit"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <p className="publish-hint">
              Create one at Cloudflare → My Profile → API Tokens → Create Token, with{" "}
              <strong>Account · Cloudflare Pages · Edit</strong>. It is saved on this computer
              and sent only to api.cloudflare.com. No credit card is needed.
            </p>
            <button type="submit" className="primary-btn" disabled={!token.trim() || Boolean(busy)}>
              {busy === "connect" ? "Connecting…" : "Connect Cloudflare"}
            </button>
          </form>
        ) : null}

        {connection.connected ? (
          <div className="publish-body">
            <div className="publish-account">
              <span className="publish-dot" aria-hidden="true" />
              <span>
                Connected to <strong>{connection.accountName ?? "Cloudflare"}</strong>
              </span>
            </div>

            {published ? (
              <div className="publish-live">
                <span className="publish-live-label">Live</span>
                <a href={published.url} target="_blank" rel="noreferrer" className="publish-url">
                  {published.url}
                </a>
                <div className="publish-actions">
                  <button type="button" onClick={() => void copyUrl(published.url)}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void publish()}
                    disabled={Boolean(busy)}
                  >
                    {busy === "publish" ? "Publishing…" : "Republish"}
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => void takeOffline()}
                    disabled={Boolean(busy)}
                  >
                    {busy === "offline" ? "Removing…" : "Take offline"}
                  </button>
                </div>
                <p className="publish-hint">
                  Published {new Date(published.deployedAt).toLocaleString()}.
                </p>
              </div>
            ) : (
              <button
                type="button"
                className="primary-btn publish-start"
                onClick={() => void publish()}
                disabled={Boolean(busy)}
              >
                {busy === "publish" ? "Publishing…" : "Publish this app"}
              </button>
            )}

            {progress ? (
              <div className="publish-progress" role="status">
                <div className="publish-progress-head">
                  <span>{progress.status}</span>
                  <em>{progress.percent === null ? "…" : `${progress.percent}%`}</em>
                </div>
                <span
                  className={`publish-bar ${progress.percent === null ? "indeterminate" : ""}`}
                >
                  <span style={progress.percent === null ? undefined : { width: `${progress.percent}%` }} />
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="publish-error" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="publish-foot">
          <a className="publish-zip" href={`/api/projects/${projectId}/export`}>
            <Icon name="download" size={14} />
            Download .zip
          </a>
          <span>Every file, no account needed. Host it anywhere.</span>
        </footer>
      </div>
    </div>
  );
}
