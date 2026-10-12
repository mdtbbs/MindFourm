
/** Shared by the writer and reader. These documents must only render in a sandbox. */
export const HTML_DOCUMENT_MAX_LENGTH = 200_000;
export const HTML_DOCUMENT_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'; object-src 'none'";

export function isHtmlDocument(html: string): boolean {
  return /<!doctype\s+html\b|<html\b|<style\b/i.test(html);
}

type HtmlSanitizeOptions = {
  allowedTags: string[];
  allowedAttributes: Record<string, string[]>;
  parseStyleAttributes?: boolean;
  allowVulnerableTags?: boolean;
  allowedSchemes?: string[];
  allowedSchemesByTag?: Record<string, string[]>;
  allowProtocolRelative?: boolean;
  nonTextTags?: string[];
  transformTags?: Record<string, (tag: string, attrs: Record<string, string>) => { tagName: string; attribs: Record<string, string> }>;
};

/** Dependency injection lets each package resolve its own HTML parser installation. */
export function createHtmlDocumentPolicy(sanitizeHtml: (html: string, options: HtmlSanitizeOptions) => string) {
  /** CSS is deliberately preserved: sandbox + CSP contain it in its own viewport. */
  function sanitizeHtmlDocument(html: string): string {
    if (!html.trim() || html.length > HTML_DOCUMENT_MAX_LENGTH) return '';
    const fragment = sanitizeHtml(html, {
      allowedTags: ['style', 'a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'caption', 'cite', 'code',
        'col', 'colgroup', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol',
        'p', 'pre', 'q', 's', 'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
        'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var'],
      allowedAttributes: {
        '*': ['class', 'id', 'style', 'title', 'dir'],
        a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
        ol: ['start', 'type', 'reversed'], li: ['value'], td: ['colspan', 'rowspan', 'scope', 'align'],
        th: ['colspan', 'rowspan', 'scope', 'align'], col: ['span'], colgroup: ['span'], details: ['open'],
        time: ['datetime'], q: ['cite'], blockquote: ['cite'],
      },
      parseStyleAttributes: false,
      allowVulnerableTags: true, // Only style is allowed; scripts remain forbidden.
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: { img: ['http', 'https'] },
      allowProtocolRelative: false,
      nonTextTags: ['script', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template', 'title', 'svg', 'math'],
      transformTags: {
        a: (tagName, attribs) => ({ tagName, attribs: {
          ...attribs, target: attribs.href?.startsWith('#') ? '_self' : '_blank', rel: 'nofollow noopener noreferrer',
        } }),
        img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, decoding: 'async' } }),
      },
    }).trim();
    // A stylesheet on its own is not a usable block.
    const body = sanitizeHtml(fragment, { allowedTags: ['img'], allowedAttributes: { img: ['src', 'alt'] } }).trim();
    const document = '<!doctype html>\n' + fragment;
    return body && document.length <= HTML_DOCUMENT_MAX_LENGTH ? document : '';
  }

  function htmlDocumentSrcDoc(html: string, theme: { color?: string; background?: string; font?: string } = {}): string {
    const safe = sanitizeHtmlDocument(html);
    // Values come from computed styles, but escape markup at the embedding boundary too.
    const cssValue = (value: string) => value.replace(/[<>]/g, '').replace(/\r?\n/g, ' ');
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${HTML_DOCUMENT_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{min-height:0}body{margin:0;overflow-wrap:anywhere;color:${cssValue(theme.color || '#222')};background:${cssValue(theme.background || 'transparent')};font-family:${cssValue(theme.font || 'system-ui,sans-serif')}}img{max-width:100%;height:auto}</style></head><body>${safe.replace(/^<!doctype html>\s*/i, '')}</body></html>`;
  }

  /** Safe projection for API HTML consumers; no stylesheet can escape the iframe. */
  function htmlDocumentProjection(html: string): string {
    const srcdoc = htmlDocumentSrcDoc(html).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<iframe title="HTML 内容" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" style="width:100%;height:600px;border:0" srcdoc="${srcdoc}"></iframe>`;
  }
  return { sanitizeHtmlDocument, htmlDocumentSrcDoc, htmlDocumentProjection };
}
