/**
 * Shared Page Metadata Helper
 *
 * Generates consistent Next.js Metadata for all pages. Centralises the
 * title-suffix convention, Open Graph / Twitter tags and favicon resolution
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
}

export function generatePageMetadata({
  title,
  description,
  path = '/',
  brandInfo,
}: PageMetadataOptions): Metadata {
  const fullTitle = `${title} | ${brandInfo.siteName}`;
  const finalDescription = description || brandInfo.description || '';

  const favicon = brandInfo.faviconUrl || '/favicon.ico';
  const images = brandInfo.logoUrl ? [brandInfo.logoUrl] : [];

  return {
    title: fullTitle,
    description: finalDescription,
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
    twitter: {
      card: 'summary',
      title: fullTitle,
      description: finalDescription,
    },
  };
}
