/**
 * Settings Context - Backward compatibility wrapper for Zustand settings store
 *
 * This file provides backward compatibility for existing components
 * that use SettingsProvider/useSettings pattern, while internally using Zustand.
 *
 * New components should import directly from '@/store/settings-store'
 */

'use client';

import React, { useEffect } from 'react';
import { buildBrandCssVariables } from '@/lib/theme/brand';
import { useSettingsStore, useSettings } from '@/store/settings-store';

// Re-export useSettings for backward compatibility
export { useSettings };

/**
 * SettingsProvider - Initializes Zustand settings store on mount
 *
 * Triggers the initial settings fetch when the app loads.
 * Existing components using useSettings() will work without changes.
 */
export function SettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings?: Record<string, string>;
}) {
  const { fetchSettings, setSettings, settings } = useSettingsStore();

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings, setSettings]);

  // Fetch once on mount as a safety net for static build fallbacks and persisted stale
  // localStorage state. The server-provided settings still drive the first render.
  useEffect(() => {
    fetchSettings({ fresh: true });
  }, [fetchSettings]);

  useEffect(() => {
    const root = document.documentElement;
    const variables = buildBrandCssVariables(settings);

    for (const [key, value] of Object.entries(variables)) {
      root.style.setProperty(key, value);
    }
  }, [settings]);

  return <>{children}</>;
}
