'use client';

import { useCallback, useEffect, useState } from 'react';

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface DraftData {
  values: Record<string, unknown>;
  timestamp: number;
}

function buildKey(type: string, id?: string | number): string {
  return `draft:${type}:${id ?? 'new'}`;
}

function loadDraft(key: string): DraftData['values'] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftData;
    if (Date.now() - draft.timestamp > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft.values;
  } catch {
    return null;
  }
}

function saveDraft(key: string, values: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify({ values, timestamp: Date.now() }));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function useDraft(type: string, id?: string | number) {
  const key = buildKey(type, id);
  const [hasDraft, setHasDraft] = useState(false);

  const load = useCallback((): DraftData['values'] | null => {
    const values = loadDraft(key);
    setHasDraft(!!values);
    return values;
  }, [key]);

  const save = useCallback(
    (values: Record<string, unknown>) => {
      saveDraft(key, values);
      setHasDraft(true);
    },
    [key]
  );

  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setHasDraft(false);
  }, [key]);

  return { load, save, clear, hasDraft };
}

/**
 * Debounced auto-save: call `save` 2s after the last `values` change.
 */
export function useDraftAutoSave(
  values: Record<string, unknown>,
  saveFn: (v: Record<string, unknown>) => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => saveFn(values), 2000);
    return () => clearTimeout(timer);
  }, [values, saveFn, enabled]);
}
