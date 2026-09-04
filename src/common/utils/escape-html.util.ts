const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape a value for interpolation into HTML text or an attribute.
 *
 * Used by the email templates, which substituted usernames and post titles into
 * their markup verbatim — and usernames come from MindAuth, so they are not ours to
 * trust. This is for plain-text values only; rendered Markdown goes through
 * `sanitize` in markdown.util.ts instead.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}
