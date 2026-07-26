/**
 * Hybrid `id-slug` URL params, e.g. `123-my-post-title`.
 *
 * The id stays the real key, so a stale or absent slug still resolves — that keeps
 * old links working when a title is edited. Mirrors
 * `MindFourm/src/common/utils/url-slug.util.ts`; the backend copy cannot be imported
 * here because the two are separate packages.
 */

/**
 * Numeric id from a hybrid param, or null when there is no numeric prefix.
 *
 * Note `parseInt('123-anything')` also yields 123, which is exactly why every such
 * variant used to return an identical 200 page and create an unbounded duplicate URL
 * space. Callers pair this with a canonical link so only one form is indexed.
 */
export function extractIdFromHybridParam(param: string): number | null {
  if (!param || typeof param !== 'string') {
    return null;
  }

  const match = param.match(/^(\d+)(?:-|$)/);
  if (!match) {
    return null;
  }

  const id = parseInt(match[1], 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** `id-slug`, or just the id when no slug is available. */
export function buildHybridParam(id: number, slug: string): string {
  if (!id || !slug) {
    return String(id);
  }

  return `${id}-${slug}`;
}
