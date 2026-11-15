"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { CygnusUpdateStatus } from "@/types/cygnus-updater";

function titleFor(status: CygnusUpdateStatus): string {
  if (status.state === "downloading") return "Downloading update";
  if (status.state === "downloaded" || status.state === "installing") {
    return "Restarting to update";
  }
  if (status.state === "manual") return "New portable build";
  if (status.state === "error") return "Update failed";
  return "Update available";
}

function bodyFor(status: CygnusUpdateStatus): string {
  if (status.state === "downloading") {
    return `Downloading Cygnus ${status.version ?? ""}… ${status.percent ?? 0}%`;
  }
  if (status.state === "downloaded" || status.state === "installing") {
    return "Cygnus will restart to finish. Your projects stay on this computer.";
  }
  if (status.state === "manual") {
    return "Portable builds do not install in place. Open the release page and download the new EXE.";
  }
  if (status.state === "error") {
    return status.message || "The update could not be completed.";
  }
  return `Cygnus ${status.version ?? "update"} is ready. Update and restart in one click.`;
}

export default function UpdateToast() {
  const [status, setStatus] = useState<CygnusUpdateStatus | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const api = window.cygnusUpdater;
    if (!api) return;

    let alive = true;
    api
      .getStatus()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => {
        // The bridge is optional outside the packaged desktop app.
      });

    const unsubscribe = api.onStatus((next) => {
      if (!alive) return;
      setStatus(next);
      setActionError(null);
      setBusy(false);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (!status) return null;
  if (status.state === "idle" || status.state === "checking") return null;
  if (dismissedVersion && dismissedVersion === status.version) return null;

  const api = window.cygnusUpdater;
  if (!api) return null;

  const isWorking = busy || status.state === "downloading";
  const isRestarting = status.state === "downloaded" || status.state === "installing";
  const visibleError = actionError || (status.state === "error" ? status.message : null);

  async function runDownload() {
    if (!api || isWorking) return;
    setBusy(true);
    setActionError(null);
    const result = await api.download();
    if (!result.ok) {
      setActionError(result.error || "Could not download the update.");
      setBusy(false);
    }
  }

  async function openManual() {
    if (!api) return;
    setBusy(true);
    try {
      await api.openDownload();
      setDismissedVersion(status?.version ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!api) return;
    if (status?.version) {
      await runDownload();
      return;
    }
    setBusy(true);
    setActionError(null);
    const next = await api.check();
    setStatus(next);
    setBusy(false);
  }

  return (
    <aside
      className={`update-toast update-${status.state}`}
      aria-label={titleFor(status)}
      aria-live="polite"
    >
      <div className="update-toast-mark" aria-hidden="true">
        <Icon name={isRestarting ? "refresh" : "sparkles"} size={15} />
      </div>
      <div className="update-toast-copy">
        <strong>{titleFor(status)}</strong>
        <p>{bodyFor(status)}</p>
        {visibleError && status.state !== "error" ? (
          <p className="update-toast-error">{visibleError}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="update-toast-dismiss"
        onClick={() => setDismissedVersion(status.version ?? "current")}
        aria-label="Dismiss update"
        disabled={isRestarting}
      >
        <Icon name="close" size={14} />
      </button>

      {status.state === "downloading" ? (
        <div
          className="update-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status.percent ?? 0}
        >
          <span style={{ width: `${Math.max(2, status.percent ?? 0)}%` }} />
        </div>
      ) : null}

      <div className="update-toast-actions">
        {status.state === "available" ? (
          <>
            <button type="button" className="update-later" onClick={() => setDismissedVersion(status.version ?? "current")}>
              Later
            </button>
            <button type="button" className="update-action" onClick={() => void runDownload()} disabled={isWorking}>
              {isWorking ? "Starting…" : "Update now"}
            </button>
          </>
        ) : null}

        {status.state === "manual" ? (
          <>
            <button type="button" className="update-later" onClick={() => setDismissedVersion(status.version ?? "current")}>
              Later
            </button>
            <button type="button" className="update-action" onClick={() => void openManual()} disabled={busy}>
              {busy ? "Opening…" : "Download"}
            </button>
          </>
        ) : null}

        {status.state === "downloading" ? (
          <button type="button" className="update-action" disabled>
            Updating…
          </button>
        ) : null}

        {isRestarting ? (
          <button type="button" className="update-action" disabled>
            Restarting…
          </button>
        ) : null}

        {status.state === "error" ? (
          <>
            <button type="button" className="update-later" onClick={() => setDismissedVersion(status.version ?? "current")}>
              Dismiss
            </button>
            <button type="button" className="update-action" onClick={() => void retry()} disabled={busy}>
              {busy ? "Retrying…" : "Retry"}
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
