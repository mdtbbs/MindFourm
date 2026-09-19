/** Normalize accidental Markdown heading markers pasted into the title field. */
export function normalizePostTitle(value: string): string {
  return value.replace(/^(?:\s*#\s*)+/, '').replace(/\s+/g, ' ').trim();
}
