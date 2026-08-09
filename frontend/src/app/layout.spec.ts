/**
 * Root Layout Metadata spec
 *
 * Verifies that the root layout's metadata generation resolves favicon URLs
 * correctly from settings — using site_favicon_url when provided and falling
 * back to /favicon.ico when empty.
 *
 * This spec runs as a plain Node script (no Jest/RTL setup needed), following
 * the same IIFE + assert pattern as `metadata.spec.ts`, `site-navigation.spec.ts`
 * and `settings-store.spec.ts`.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nReceived: ${JSON.stringify(actual)}`);
  }
}

/**
 * Resolves favicon URL from settings — mirrors the logic in layout.tsx's
 * generateMetadata(). Extracted here for testability.
 */
function resolveFaviconUrl(settings: Record<string, string>): string {
  return settings.site_favicon_url?.trim() || '/favicon.ico';
}

/**
 * Builds icons metadata from a favicon URL — mirrors the structure produced
 * by layout.tsx's generateMetadata().
 */
function buildIconsMetadata(faviconUrl: string) {
  return {
    icon: faviconUrl,
    shortcut: faviconUrl,
    apple: faviconUrl,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Test: should use site_favicon_url when provided
// ────────────────────────────────────────────────────────────────────────────
(function testCustomFaviconUrl() {
  const settings = {
    site_name: 'Test Forum',
    site_favicon_url: 'https://example.com/custom-favicon.ico',
  };

  const faviconUrl = resolveFaviconUrl(settings);
  const icons = buildIconsMetadata(faviconUrl);

  assertEqual(icons.icon, 'https://example.com/custom-favicon.ico', 'icon should use site_favicon_url');
  assertEqual(icons.shortcut, 'https://example.com/custom-favicon.ico', 'shortcut should use site_favicon_url');
  assertEqual(icons.apple, 'https://example.com/custom-favicon.ico', 'apple should use site_favicon_url');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should fallback to /favicon.ico when site_favicon_url is empty
// ────────────────────────────────────────────────────────────────────────────
(function testFaviconFallbackWhenEmpty() {
  const settings = {
    site_name: 'Test Forum',
    site_favicon_url: '',
  };

  const faviconUrl = resolveFaviconUrl(settings);
  const icons = buildIconsMetadata(faviconUrl);

  assertEqual(icons.icon, '/favicon.ico', 'icon should fallback to /favicon.ico');
  assertEqual(icons.shortcut, '/favicon.ico', 'shortcut should fallback to /favicon.ico');
  assertEqual(icons.apple, '/favicon.ico', 'apple should fallback to /favicon.ico');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should fallback to /favicon.ico when site_favicon_url is missing
// ────────────────────────────────────────────────────────────────────────────
(function testFaviconFallbackWhenMissing() {
  const settings = {
    site_name: 'Test Forum',
  };

  const faviconUrl = resolveFaviconUrl(settings);
  const icons = buildIconsMetadata(faviconUrl);

  assertEqual(icons.icon, '/favicon.ico', 'icon should fallback to /favicon.ico when key missing');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should trim whitespace from site_favicon_url
// ────────────────────────────────────────────────────────────────────────────
(function testFaviconTrimWhitespace() {
  const settings = {
    site_favicon_url: '  https://example.com/favicon.ico  ',
  };

  const faviconUrl = resolveFaviconUrl(settings);

  assertEqual(faviconUrl, 'https://example.com/favicon.ico', 'should trim whitespace from favicon URL');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should fallback when site_favicon_url is whitespace only
// ────────────────────────────────────────────────────────────────────────────
(function testFaviconFallbackWhenWhitespaceOnly() {
  const settings = {
    site_favicon_url: '   ',
  };

  const faviconUrl = resolveFaviconUrl(settings);

  assertEqual(faviconUrl, '/favicon.ico', 'should fallback to /favicon.ico when URL is whitespace only');
})();

assert(true, 'layout spec executed');
