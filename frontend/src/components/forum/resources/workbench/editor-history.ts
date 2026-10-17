'use client';

import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

// Snapshots contain editor operations, never game-file bytes. Limit both count
// and memory so large processor/clipboard edits do not exhaust a mobile tab.
function append(values: string[], snapshot: string): string[] {
  const next = [...values.slice(-99), snapshot];
  let bytes = snapshot.length*2, keep = next.length-1;
  while (keep > 0 && bytes + next[keep-1].length*2 <= 32*1024*1024) { keep--; bytes += next[keep].length*2; }
  return next.slice(keep);
}
export function useEditorHistory<T>(state: T, restore: (value: T) => void) {
  const current = useRef(state); current.current = state;
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const remember = () => { const snapshot = JSON.stringify(current.current); setPast(values => append(values, snapshot)); setFuture([]); };
  const undo = () => {
    if (!past.length) return;
    const snapshot = JSON.stringify(current.current);
    setFuture(values => append(values, snapshot));
    restore(JSON.parse(past[past.length-1]) as T); setPast(values => values.slice(0,-1));
  };
  const redo = () => {
    if (!future.length) return;
    const snapshot = JSON.stringify(current.current);
    setPast(values => append(values, snapshot));
    restore(JSON.parse(future[future.length-1]) as T); setFuture(values => values.slice(0,-1));
  };
  const reset = useCallback(() => { setPast([]); setFuture([]); }, []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.stopPropagation(); event.shiftKey ? redo() : undo(); }
    if (event.key.toLowerCase() === 'y') { event.preventDefault(); event.stopPropagation(); redo(); }
  };
  return { remember, undo, redo, reset, onKeyDown, canUndo: past.length > 0, canRedo: future.length > 0 };
}
