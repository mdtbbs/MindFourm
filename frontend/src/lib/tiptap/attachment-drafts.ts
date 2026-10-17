import type { AttachmentDraft } from '@/types';

/** Display metadata is local-only: it never becomes part of canonical Schema v2 JSON. */
const drafts = new Map<string, Pick<AttachmentDraft, 'file_name' | 'file_size' | 'mime_type'>>();
export function rememberAttachmentDraft(draft: AttachmentDraft) {
  const metadata = { file_name: draft.file_name, file_size: draft.file_size, mime_type: draft.mime_type };
  drafts.set(draft.token, metadata);
  try { sessionStorage.setItem(`rich-attachment:${draft.token}`, JSON.stringify(metadata)); } catch { /* Storage can be unavailable. */ }
}
export function readAttachmentDraft(token: string) {
  if (drafts.has(token)) return drafts.get(token);
  try {
    const data = JSON.parse(sessionStorage.getItem(`rich-attachment:${token}`) || 'null');
    if (data && typeof data.file_name === 'string' && typeof data.mime_type === 'string' && Number.isFinite(data.file_size) && data.file_size >= 0) return data as Pick<AttachmentDraft, 'file_name' | 'file_size' | 'mime_type'>;
  } catch { /* Recovered drafts can still render without cached display metadata. */ }
  return undefined;
}
