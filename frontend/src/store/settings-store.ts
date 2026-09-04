/**
 * Settings Store - Zustand state management for site settings
 *
 * Manages global site settings fetched from the API.
 *
 * Server-side hydration:
 *   `hydrateFromServer(settings)` is called synchronously during the React
 *   render of SettingsProvider (before children subscribe). This guarantees
 *   that the first client paint already carries the server-provided brand
 *   values, eliminating the "flash of empty/stale settings" that would occur
 *   if we waited for useEffect.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { settingsApi } from '@/lib/api/client';

interface SettingsState {
  settings: Record<string, string>;
  isLoading: boolean;
  lastUpdated: string | null;

  // Actions
  setSettings: (settings: Record<string, string>) => void;
  updateSetting: (key: string, value: string) => void;
  fetchSettings: (options?: { fresh?: boolean }) => Promise<void>;
  getSetting: (key: string, defaultValue?: string) => string | undefined;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: {},
      isLoading: false,
      lastUpdated: null,

      setSettings: (settings) => {
        set({
          settings,
          lastUpdated: new Date().toISOString(),
        });
      },

      updateSetting: (key, value) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
          lastUpdated: new Date().toISOString(),
        }));
      },

      fetchSettings: async (options?: { fresh?: boolean }) => {
        set({ isLoading: true });
        try {
          const settings = await settingsApi.get({ fresh: options?.fresh });
          set({
            settings: settings || {},
            isLoading: false,
            lastUpdated: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Failed to fetch settings:', error);
          set({ isLoading: false });
        }
      },

      getSetting: (key, defaultValue) => {
        const state = get();
        return state.settings[key] ?? defaultValue;
      },
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist settings with 5-minute TTL check
        settings: state.settings,
        lastUpdated: state.lastUpdated,
      }),
    }
  )
);

/**
 * Synchronously seed the Zustand store with server-rendered settings.
 *
 * Must be called during the SettingsProvider render (before children subscribe)
 * so that the first client paint carries the server-provided values instead of
 * whatever stale data localStorage may hold.
 *
 * Calling `setState` outside useEffect is safe here: Zustand's setState is a
 * plain synchronous function, and because the provider renders before its
 * children, any child that subscribes via `useSettingsStore` will see the
 * hydrated values on its very first render.
 */
export function hydrateFromServer(settings: Record<string, string>): void {
  if (!settings || Object.keys(settings).length === 0) return;

  const current = useSettingsStore.getState().settings;
  // Skip when the store already holds the exact same data (e.g. re-render
  // with the same server response, or localStorage happened to match).
  if (shallowEqual(current, settings)) return;

  useSettingsStore.setState({
    settings,
    lastUpdated: new Date().toISOString(),
  });
}

function shallowEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// Convenience hook for getting specific settings
export function useSetting(key: string, defaultValue?: string) {
  return useSettingsStore((state) => state.settings[key] ?? defaultValue);
}

// Backward compatibility hook
export function useSettings() {
  return useSettingsStore((state) => state.settings);
}