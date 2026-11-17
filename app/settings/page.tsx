"use client";

import Link from "next/link";
import ProviderSettings from "@/components/ProviderSettings";
import { useProvider } from "@/components/ProviderContext";

export default function SettingsPage() {
  const { provider, chooseProvider } = useProvider();

  return (
    <div className="page-scroll settings-page">
      <div className="settings-frame">
        <header className="page-head settings-head">
          <span className="page-eyebrow">Settings</span>
          <h1>Models &amp; connections.</h1>
          <p>
            Pick an on-device open model in the composer, connect Ollama or LM Studio, or bring
            your own key. Keys stay in this browser.
          </p>
        </header>

        <ProviderSettings
          open
          embedded
          provider={provider}
          onSave={chooseProvider}
          onClose={() => {}}
        />

        <div className="settings-footer-links">
          <Link href="/plugins">
            <IconLink />
            Local runtimes
          </Link>
          <Link href="/library">
            Your generated files <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function IconLink() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v4.5a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 18v3" />
    </svg>
  );
}
