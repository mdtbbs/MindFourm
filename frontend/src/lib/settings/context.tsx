'use client';

import { createContext, useContext, useState } from 'react';

type SettingsContextValue = Record<string, string>;

interface SettingsContextState {
  settings: SettingsContextValue;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextState | null>(null);

interface SettingsProviderProps {
  initialSettings?: SettingsContextValue;
  children: React.ReactNode;
}

export function SettingsProvider({ initialSettings = {}, children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<SettingsContextValue>(initialSettings);

  const refreshSettings = async () => {
    const res = await fetch('/api/settings', { credentials: 'include' });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success) setSettings(json.data);
  };

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  return ctx?.settings ?? {};
}

export function useSettingsRefresh() {
  const ctx = useContext(SettingsContext);
  return ctx?.refreshSettings ?? (async () => {});
}
