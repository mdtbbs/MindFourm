import { find } from 'linkifyjs';

/**
 * Bounds on what the link extension is allowed to hand to linkify.
 *
 * `find()` is super-linear in the length of a whitespace-free run: it explores
 * the URL state machine per candidate, so one long run costs ~quadratically.
 * Measured on the same 54KB payload: split into ordinary words it is ~10ms, but
 * as one run of `中文_a说明_b。` it is 8-12 seconds — a paste that freezes the
 * editor, with no syntax it could ever link.
 *
 * A run longer than `MAX_LINKIFY_RUN` is therefore not a candidate at all. The
 * ceiling matches `normalizeEditorLink`'s own 2048-character URL limit, so every
 * link the editor would accept is still found.
 */
export const MAX_LINKIFY_RUN = 2048;

export interface PlausibleLink {
  text: string;
  href: string;
  index: number;
}

/**
 * Links inside a text, scanning only the runs short enough to be one.
 *
 * The index is relative to the whole input, so it can be handed to the paste
 * rule unchanged.
 */
export function findPlausibleLinks(text: string): PlausibleLink[] {
  const links: PlausibleLink[] = [];
  if (!text) return links;
  for (const run of text.matchAll(/\S+/g)) {
    if (run[0].length > MAX_LINKIFY_RUN) continue;
    for (const link of find(run[0])) {
      if (!link.isLink) continue;
      links.push({ text: link.value, href: link.href, index: link.start + (run.index ?? 0) });
    }
  }
  return links;
}
