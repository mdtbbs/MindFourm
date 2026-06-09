"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMarkdown = parseMarkdown;
exports.sanitize = sanitize;
const marked_1 = require("marked");
marked_1.marked.setOptions({
    gfm: true,
    breaks: true,
});
const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'del', 'ins', 'sub', 'sup', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'details', 'summary',
]);
const ALLOWED_ATTRS = new Set(['href', 'title', 'alt', 'src', 'class', 'target', 'rel']);
function parseMarkdown(content) {
    const html = marked_1.marked.parse(content);
    return sanitize(html);
}
function sanitize(html) {
    let sanitized = html.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/javascript\s*:/gi, '');
    return sanitized;
}
//# sourceMappingURL=markdown.util.js.map