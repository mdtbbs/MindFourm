import { isHtmlDocument, sanitizeHtmlDocument } from './html-document';
import { sanitizeTrustedHtmlClient } from './trusted-html';

export interface HtmlBlockDraftStats {
  characters: number;
  isDocument: boolean;
  embeddedImages: number;
  remoteImages: number;
}

/**
 * The cheap half of the HTML block draft check.
 *
 * The dialog used to sanitize on every keystroke, which meant a full
 * parse-and-rewrite pass for every character typed — over a document the author
 * is still assembling. The status line only needs counts, so this scans with
 * three regexes and never builds a tree: it is the pass that can run while
 * typing, and `sanitizeHtmlBlockPreview` is the pass that runs when the author
 * asks for a preview.
 */
export function analyzeHtmlBlockDraft(draft: string): HtmlBlockDraftStats {
  const embedded = draft.match(/data:image\/[a-z0-9.+-]+;base64,/gi);
  const remote = draft.match(/(?:src\s*=\s*["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/)/gi);
  return {
    characters: draft.length,
    isDocument: isHtmlDocument(draft),
    embeddedImages: embedded?.length ?? 0,
    remoteImages: remote?.length ?? 0,
  };
}

/** The sanitized value that gets stored, for the markup as it arrived. */
export function sanitizeHtmlBlockDraft(draft: string): string {
  return isHtmlDocument(draft) ? sanitizeHtmlDocument(draft) : sanitizeTrustedHtmlClient(draft);
}

/**
 * The preview form of the same pass.
 *
 * Base64 payloads are removed first: they are uploaded and rewritten as site
 * URLs at submit time, so previewing them would mean handing the sanitizer
 * megabytes it can only discard.
 */
export function sanitizeHtmlBlockPreview(draft: string): string {
  return sanitizeHtmlBlockDraft(draft.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+/gi, ''));
}
