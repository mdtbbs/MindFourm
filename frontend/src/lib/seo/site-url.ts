/**
 * Canonical site origin, used for `metadataBase`, canonical links and the sitemap.
 *
 * Deliberately reads only `NEXT_PUBLIC_SITE_URL`. The sitemap used to fall back to
 * the admin-editable `site_url` setting, which is *seeded* to
 * `http://localhost:3000` — so a deployment that never set the environment variable
 * published a sitemap full of localhost URLs while its production guard, which only
 * triggered on a falsy value, was bypassed.
 */
export function getSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/**
 * `metadataBase` for the Next.js Metadata API.
 *
 * Without it, relative OG/Twitter image paths resolve against an unknown origin and
 * Next emits a build warning. `seo_og_image` is admin-editable and may well be a
 * relative path.
 */
export function getMetadataBase(): URL | undefined {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return undefined;
  try {
    return new URL(siteUrl);
  } catch {
    return undefined;
  }
}

/**
 * Absolute URL for a site-relative path, or the path itself when the origin is
 * unknown (Next resolves it against `metadataBase` in that case).
 */
export function absoluteUrl(path: string): string {
  const siteUrl = getSiteUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return siteUrl ? `${siteUrl}${normalized}` : normalized;
}
