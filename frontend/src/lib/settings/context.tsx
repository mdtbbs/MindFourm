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
import { useSettingsStore, useSettings } from '@/store/settings-store';

// Re-export useSettings for backward compatibility
export { useSettings };

/**
 * SettingsProvider - Initializes Zustand settings store on mount
 *
 * Triggers the initial settings fetch when the app loads.
 * Existing components using useSettings() will work without changes.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { fetchSettings } = useSettingsStore();

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return <>{children}</>;
}