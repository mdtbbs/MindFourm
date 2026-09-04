/**
 * Shared Page Metadata Helper
 *
 * Generates consistent Next.js Metadata for all pages. Centralises the
 * title-suffix convention, Open Graph tags and favicon resolution
 * so that individual pages never have to repeat the same boilerplate or
 * hard-code the site name.
 *
 * Consumes BrandInfo from resolveBrand() in @/lib/theme/brand.
 */

import type { Metadata } from 'next';
import type { BrandInfo } from '@/lib/theme/brand';

export interface PageMetadataOptions {
  title: string;
  description?: string;
  path?: string;
  brandInfo: BrandInfo;
  /** Admin-configured social sharing image, falling back to the site logo. */
  openGraphImage?: string;
}

export function generatePageMetadata({
  title,
  description,
  path = '/',
  brandInfo,
  openGraphImage,
}: PageMetadataOptions): Metadata {
  const fullTitle = `${title} | ${brandInfo.siteName}`;
  const finalDescription = description || brandInfo.description || '';

  const favicon = brandInfo.faviconUrl || '/favicon.ico';
  const socialImage = openGraphImage?.trim() || brandInfo.logoUrl;
  const images = socialImage ? [socialImage] : [];

  // NOTE: `title` is returned bare — the root layout's `title.template` appends
  // the site-name suffix automatically. Passing `fullTitle` here produced
  // "标题 | MindForum | MindForum" because the suffix was applied twice.
  // Open Graph titles are not templated, so they still need the full title.
  return {
    title,
    description: finalDescription,
    alternates: {
      canonical: path,
    },
    icons: {
      icon: favicon,
      shortcut: favicon,
      apple: favicon,
    },
    openGraph: {
      title: fullTitle,
      description: finalDescription,
      images,
      type: 'website',
      url: path,
    },
  };
}
