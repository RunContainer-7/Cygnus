"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type GithubStatus = {
  connected: boolean;
  login?: string;
  name?: string;
  avatarUrl?: string;
};

type GithubRepo = {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  description: string;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
};

/**
 * GitHub is connected by Cygnus itself with a token the user creates. No
 * Freebuff account is involved, and the token never goes to Cygnus servers.
 */
export default function GitHubPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<GithubStatus>({ connected: false });
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/github", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        status?: GithubStatus;
        repos?: GithubRepo[];
        error?: string;
      };
      setStatus(data.status ?? { connected: false });
      setRepos(Array.isArray(data.repos) ? data.repos : []);
      if (data.error) setError(data.error);
    } catch {
      setError("Could not reach GitHub from Cygnus.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    const value = token.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        status?: GithubStatus;
        error?: string;
      };
      if (!response.ok || !data.status) {
        throw new Error(data.error ?? "GitHub rejected that token.");
      }
      setStatus(data.status);
      setToken("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect GitHub.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/github", { method: "DELETE" });
      setStatus({ connected: false });
      setRepos([]);
    } finally {
      setBusy(false);
    }
  }

  async function importRepo(fullName: string) {
    setImporting(fullName);
    setError(null);
    try {
      const response = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: fullName }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        project?: { id: string };
        error?: string;
      };
      if (!response.ok || !data.project) {
        throw new Error(data.error ?? "Could not import that repository.");
      }
      router.push(`/build/${data.project.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import that repository.");
      setImporting(null);
    }
  }

  const filtered = repos.filter((repo) =>
    `${repo.fullName} ${repo.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <section className="github-panel" id="github">
      <header className="github-head">
        <div>
          <span className="page-eyebrow">GitHub</span>
          <h2>Work on your repos</h2>
          <p>
            Import a repository into Cygnus, let the agent edit it, then push the commit back.
            Cygnus connects directly with your own token — Freebuff is never asked for access.
          </p>
        </div>
        {status.connected ? (
          <div className="github-account">
            {status.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={status.avatarUrl} alt="" width={28} height={28} />
            ) : null}
            <span>{status.name || status.login}</span>
            <button type="button" onClick={() => void disconnect()} disabled={busy}>
              Disconnect
            </button>
          </div>
        ) : null}
      </header>

      {!status.connected ? (
        <form
          className="github-connect"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <label className="field">
            <span className="field-label">Personal access token</span>
            <input
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                setError(null);
              }}
              placeholder="github_pat_… or ghp_…"
              spellCheck={false}
              autoComplete="off"
            />
            <span className="field-hint">
              Create a fine-grained token with <strong>Contents</strong> and{" "}
              <strong>Metadata</strong> read/write. It is saved in the Cygnus data folder on
              this computer and sent only to api.github.com.
            </span>
          </label>
          <button type="submit" className="primary-btn" disabled={!token.trim() || busy}>
            {busy ? "Checking…" : "Connect GitHub"}
          </button>
        </form>
      ) : (
        <div className="github-repos">
          <input
            className="picker-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter repositories"
            aria-label="Filter repositories"
            spellCheck={false}
          />
          {loading ? <p className="panel-hint">Loading repositories…</p> : null}
          {!loading && filtered.length === 0 ? (
            <p className="panel-hint">No repositories match.</p>
          ) : null}
          <div className="github-repo-list">
            {filtered.map((repo) => (
              <div className="github-repo" key={repo.fullName}>
                <div className="github-repo-main">
                  <strong>{repo.fullName}</strong>
                  <span>
                    {repo.private ? "Private" : "Public"} · {repo.defaultBranch} ·{" "}
                    {repo.description || "No description"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void importRepo(repo.fullName)}
                  disabled={Boolean(importing)}
                >
                  {importing === repo.fullName ? "Importing…" : "Import"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <p className="mp-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
