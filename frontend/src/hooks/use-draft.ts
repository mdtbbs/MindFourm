'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface DraftSnapshot {
  values: Record<string, unknown>;
  timestamp: number;
}

function buildKey(type: string, id?: string | number): string {
  return `draft:${type}:${id ?? 'new'}`;
}

function loadDraft(key: string): DraftSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftSnapshot;
    if (!draft || typeof draft.timestamp !== 'number' || !draft.values || typeof draft.values !== 'object') {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - draft.timestamp > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(key: string, values: Record<string, unknown>): DraftSnapshot {
  const draft = { values, timestamp: Date.now() };
  localStorage.setItem(key, JSON.stringify(draft));
  return draft;
}

function stringifyDraft(values: Record<string, unknown>): string {
  try {
    return JSON.stringify(values);
  } catch {
    // Form values are expected to be plain objects. Keep the hook safe if a
    // future caller accidentally puts a non-serialisable value into one.
    return '';
  }
}

export function useDraft(type: string, id?: string | number) {
  const key = buildKey(type, id);
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback((): DraftSnapshot | null => {
    const nextSnapshot = loadDraft(key);
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, [key]);

  const save = useCallback(
    (values: Record<string, unknown>): boolean => {
      try {
        const nextSnapshot = saveDraft(key, values);
        setSnapshot(nextSnapshot);
        setSaveError(null);
        return true;
      } catch {
        // Browsers can reject localStorage in private mode or once the quota is
        // exhausted. Expose that to the form instead of claiming the draft is safe.
        setSaveError('无法保存到此设备，请复制内容后再离开页面。');
        return false;
      }
    },
    [key]
  );

  const clear = useCallback(() => {
    localStorage.removeItem(key);
    setSnapshot(null);
    setSaveError(null);
  }, [key]);

  // Memoised: returning a fresh object literal made this hook's result a new
  // identity on every render, so consumers using it as an effect dependency
  // (ReplyEditor did) re-ran their restore logic continuously — which meant a
  // saved draft kept overwriting whatever the user was typing.
  return useMemo(
    () => ({
      load,
      save,
      clear,
      hasDraft: !!snapshot,
      lastSavedAt: snapshot?.timestamp ?? null,
      saveError,
    }),
    [load, save, clear, snapshot, saveError],
  );
}

/**
 * Debounced auto-save: call `save` 2s after the last `values` change.
 */
export function useDraftAutoSave(
  values: Record<string, unknown>,
  saveFn: (v: Record<string, unknown>) => void,
  enabled = true
) {
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const fingerprint = stringifyDraft(values);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => saveFn(valuesRef.current), 2000);
    return () => clearTimeout(timer);
  }, [fingerprint, saveFn, enabled]);
}
