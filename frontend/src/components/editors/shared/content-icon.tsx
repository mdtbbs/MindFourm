'use client';

import type { EditorContentEntry } from '@/lib/editors/editor-api';

export function ContentIcon({ entry, size = 28 }: { entry?: EditorContentEntry | null; size?: number }) {
  return <span className="inline-flex shrink-0 items-center justify-center overflow-hidden bg-[var(--bg-muted)]" style={{ width: size, height: size }} aria-hidden="true">
    {entry?.icon ? <img src={entry.icon} alt="" width={size} height={size} className="h-full w-full object-contain [image-rendering:pixelated]" />
      : <span className="h-3/5 w-3/5 border border-[var(--border)] bg-[var(--primary-soft)]" />}
  </span>;
}

export function contentLabel(entry: EditorContentEntry): string {
  return entry.display_name || entry.internal_name;
}
