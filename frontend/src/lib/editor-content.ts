/** Normalise TipTap's empty document representation before it reaches Markdown state. */
export function normalizeEditorContent(
  value: string | null | undefined,
): string {
  const content = value?.trim() || "";
  return /^<p>(?:\s|<br\s*\/?>)*<\/p>$/i.test(content) ? "" : value || "";
}
