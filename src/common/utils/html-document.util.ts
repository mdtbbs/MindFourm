import sanitizeHtml from 'sanitize-html';
import { createHtmlDocumentPolicy } from './html-document-policy';
export { HTML_DOCUMENT_MAX_LENGTH, HTML_DOCUMENT_CSP, isHtmlDocument } from './html-document-policy';
export const { sanitizeHtmlDocument, htmlDocumentSrcDoc, htmlDocumentProjection } = createHtmlDocumentPolicy(sanitizeHtml);
