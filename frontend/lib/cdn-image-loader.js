/**
 * CDN Image Loader for Next.js
 * Used when NEXT_PUBLIC_CDN_URL is configured
 */
export default function cdnImageLoader({ src, width, quality }) {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || '';

  // If CDN is configured, prefix the URL
  if (cdnUrl) {
    // For external images, return as-is
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }
    // For local images, prefix with CDN URL
    return `${cdnUrl}${src}?w=${width}&q=${quality || 75}`;
  }

  // Without CDN, return the original path
  return src;
}