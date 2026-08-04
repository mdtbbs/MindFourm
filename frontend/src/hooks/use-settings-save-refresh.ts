'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSettingsStore } from '@/store/settings-store';

export function useSettingsSaveRefresh() {
  const router = useRouter();
  const fetchSettings = useSettingsStore((state) => state.fetchSettings);

  return useCallback(async () => {
    await fetchSettings({ fresh: true });
    router.refresh();
  }, [fetchSettings, router]);
}
