import { repairMojibakeFilename } from './filename.util';

/** Builds a safe download header with an RFC 5987 UTF-8 filename. */
export function attachmentContentDisposition(fileName: string | null | undefined): string {
  const normalized = (repairMojibakeFilename(fileName) || 'download').replace(/[\u0000-\u001F\u007F]/g, '').trim() || 'download';
  const fallback = normalized.replace(/[\\"]/g, '_').replace(/[^\x20-\x7E]/g, '_').trim() || 'download';
  const encoded = encodeURIComponent(normalized).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
