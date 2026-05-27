'use client';

import { createContext, useContext, useState } from 'react';

type SettingsContextValue = Record<string, string>;

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  initialSettings?: SettingsContextValue;
  children: React.ReactNode;
}

export function SettingsProvider({ initialSettings = {}, children }: SettingsProviderProps) {
  // 直接使用 SSR 传入的数据，不再客户端请求
  const [settings] = useState<SettingsContextValue>(initialSettings);

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
