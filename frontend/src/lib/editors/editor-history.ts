export type EditorHistory<T> = { past: T[]; present: T; future: T[]; limit: number };

export function createEditorHistory<T>(initial: T, limit = 50): EditorHistory<T> {
  return { past: [], present: initial, future: [], limit: Math.max(1, limit) };
}

export function pushEditorHistory<T>(history: EditorHistory<T>, next: T): EditorHistory<T> {
  return {
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: [],
    limit: history.limit,
  };
}

export function undoEditorHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], limit: history.limit };
}

export function redoEditorHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return { past: [...history.past, history.present].slice(-history.limit), present: next, future: history.future.slice(1), limit: history.limit };
}
