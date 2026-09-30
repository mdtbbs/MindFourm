import type { Attachment } from '@/types';

export function omitEmbeddedAttachments(attachments: Attachment[], document: unknown): Attachment[] {
  const ids = new Set<number>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const value = node as Record<string, unknown>;
    if (value.type === 'attachment' && value.attrs && typeof value.attrs === 'object') {
      const id = Number((value.attrs as Record<string, unknown>).attachmentId);
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    }
    if (Array.isArray(value.content)) value.content.forEach(visit);
  };
  visit(document);
  return attachments.filter((attachment) => !ids.has(attachment.id));
}
