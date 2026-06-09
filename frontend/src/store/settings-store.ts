/**
 * Settings Store - Zustand state management for site settings
 *
 * Manages global site settings fetched from the API
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
  fetchSettings: () => Promise<void>;
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

      fetchSettings: async () => {
        set({ isLoading: true });
        try {
          const settings = await settingsApi.get();
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

// Convenience hook for getting specific settings
export function useSetting(key: string, defaultValue?: string) {
  return useSettingsStore((state) => state.settings[key] ?? defaultValue);
}

// Backward compatibility hook
export function useSettings() {
  return useSettingsStore((state) => state.settings);
}