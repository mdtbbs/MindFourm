'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api/client';

type SettingsContextValue = Record<string, string>;

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsContextValue>({});

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  return ctx ?? {};
}
