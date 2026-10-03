import { create } from 'zustand';
import { attachmentApi } from '@/lib/api/client';
import { fetchInBatches } from '@/lib/api/batch';
import type { Attachment } from '@/types';
import { registerUserScopedReset } from './reset-registry';

const pending = new Set<number>();
const inFlight = new Set<number>();
let scheduled = false;
let generation = 0;
const EMPTY: Attachment[] = [];

export const useReplyAttachmentStore = create<{
  attachments: Map<number, Attachment[]>;
  ensure: (id: number) => void;
}>(() => ({
  attachments: new Map(),
  ensure: (id) => {
    if (inFlight.has(id)) return;
    pending.add(id);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const ids = [...pending];
      const viewerGeneration = generation;
      pending.clear();
      ids.forEach((id) => inFlight.add(id));
      void fetchInBatches(ids, attachmentApi.getByReplies).then((rows) => {
        if (generation !== viewerGeneration) return;
        useReplyAttachmentStore.setState((state) => {
          const attachments = new Map(state.attachments);
          // Missing ids are hidden/missing targets and must clear stale metadata.
          ids.forEach((id) => attachments.set(id, rows[id] ?? []));
          return { attachments };
        });
      }).catch(() => { /* A later mount retries; retain the current card on transient failures. */ })
        .finally(() => {
          if (generation === viewerGeneration) ids.forEach((id) => inFlight.delete(id));
        });
    });
  },
}));

export function useReplyAttachments(id: number): Attachment[] {
  return useReplyAttachmentStore((state) => state.attachments.get(id) ?? EMPTY);
}

registerUserScopedReset(() => {
  generation += 1;
  pending.clear();
  inFlight.clear();
  useReplyAttachmentStore.setState({ attachments: new Map() });
});
