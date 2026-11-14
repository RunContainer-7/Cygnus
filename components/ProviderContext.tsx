"use client";

import { createContext, useContext, useEffect, useState } from "react";
import ProviderSettings from "./ProviderSettings";
import { DEFAULT_PROVIDER, loadProvider, saveProvider } from "@/lib/providers";
import type { ProviderConfig } from "@/lib/types";

type ProviderContextValue = {
  provider: ProviderConfig;
  chooseProvider: (next: ProviderConfig) => void;
  openSettings: () => void;
};

const ProviderContext = createContext<ProviderContextValue | null>(null);

export function useProvider(): ProviderContextValue {
  const value = useContext(ProviderContext);
  if (!value) throw new Error("useProvider must be used inside ProviderProvider.");
  return value;
}

export default function ProviderProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider] = useState<ProviderConfig>(DEFAULT_PROVIDER);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setProvider(loadProvider());
  }, []);

  const save = (next: ProviderConfig) => {
    saveProvider(next);
    setProvider(next);
  };

  return (
    <ProviderContext.Provider
      value={{ provider, chooseProvider: save, openSettings: () => setSettingsOpen(true) }}
    >
      {children}
      <ProviderSettings
        open={settingsOpen}
        provider={provider}
        onClose={() => setSettingsOpen(false)}
        onSave={save}
      />
    </ProviderContext.Provider>
  );
}
