/**
 * Settings Context - Backward compatibility wrapper for Zustand settings store
 *
 * This file provides backward compatibility for existing components
 * that use SettingsProvider/useSettings pattern, while internally using Zustand.
 *
 * New components should import directly from '@/store/settings-store'
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { buildBrandCssVariables } from '@/lib/theme/brand';
import { useSettingsStore, useSettings, hydrateFromServer } from '@/store/settings-store';

// Re-export useSettings for backward compatibility
export { useSettings };

/**
 * SettingsProvider - Seeds the Zustand store with server-side data before the
 * first client paint.
 *
 * The key requirement (plan §Global Constraints):
 *   "SettingsProvider / Zustand store 必须在首个客户端渲染即以 initialSettings
 *    初始化，而非等待 useEffect 才写入 store"
 *
 * How it works:
 *   1. `hydrateFromServer(initialSettings)` is called synchronously during the
 *      provider's render — BEFORE children subscribe to the store.
 *      Zustand's setState is a plain function call; it updates the store's
 *      internal state immediately, so children see the server-provided values
 *      on their very first render. No flash.
 *   2. An optional fresh fetch runs in useEffect as a safety net (e.g. admin
 *      changed settings while the page was cached). On failure the server data
 *      remains intact — the user never sees an empty state.
 *   3. Brand CSS variables are synced to :root whenever settings change.
 */
export function SettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings?: Record<string, string>;
}) {
  // Synchronously seed the store with server data. The ref guards against
  // repeated calls on re-renders (e.g. parent state changes) while still
  // allowing a genuine initialSettings update to take effect.
  const lastHydratedRef = useRef<Record<string, string> | null>(null);
  if (initialSettings && lastHydratedRef.current !== initialSettings) {
    hydrateFromServer(initialSettings);
    lastHydratedRef.current = initialSettings;
  }

  // Fresh fetch as a safety net for static-build fallbacks, persisted stale
  // localStorage state, or admin changes that bypass the Next.js cache.
  // Failure keeps the server-provided data intact — no flashing.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    useSettingsStore.getState().fetchSettings({ fresh: true });
  }, []);

  // Apply brand CSS variables to :root whenever settings change.
  const settings = useSettingsStore((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const variables = buildBrandCssVariables(settings);

    for (const [key, value] of Object.entries(variables)) {
      root.style.setProperty(key, value);
    }
  }, [settings]);

  return <>{children}</>;
}
