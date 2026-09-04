/**
 * Page Metadata Helper spec
 *
 * Verifies that generatePageMetadata() produces consistent metadata with
 * site-name suffixes, Open Graph tags, Twitter cards and favicon fallbacks.
 *
 * This spec runs as a plain Node script (no Jest/RTL setup needed), following
 * the same IIFE + assert pattern as `site-navigation.spec.ts` and
 * `settings-store.spec.ts`.
 */

import { generatePageMetadata } from './metadata';
import type { BrandInfo } from '@/lib/theme/brand';

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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`);
  }
}

const brandInfo: BrandInfo = {
  siteName: 'Test Forum',
  tagline: 'Welcome',
  description: 'A test forum',
  logoUrl: 'https://example.com/logo.png',
  faviconUrl: 'https://example.com/favicon.ico',
  sidebarTitle: 'Navigation',
  sidebarLogoUrl: '',
};

// ────────────────────────────────────────────────────────────────────────────
// Test: should generate metadata with site name suffix
// ────────────────────────────────────────────────────────────────────────────
(function testTitleWithSiteNameSuffix() {
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo,
  });

  assertEqual(metadata.title, 'Home | Test Forum', 'title should include site name suffix');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should use provided description over default
// ────────────────────────────────────────────────────────────────────────────
(function testProvidedDescriptionOverridesDefault() {
  const metadata = generatePageMetadata({
    title: 'Home',
    description: 'Custom description',
    brandInfo,
  });

  assertEqual(metadata.description, 'Custom description', 'provided description should override brand default');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should fallback to brand description when none provided
// ────────────────────────────────────────────────────────────────────────────
(function testFallbackToBrandDescription() {
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo,
  });

  assertEqual(metadata.description, 'A test forum', 'should fallback to brand description');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should fallback to empty string when no description available
// ────────────────────────────────────────────────────────────────────────────
(function testFallbackToEmptyDescription() {
  const noDescBrand: BrandInfo = { ...brandInfo, description: '' };
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo: noDescBrand,
  });

  assertEqual(metadata.description, '', 'should fallback to empty string when no description available');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should include Open Graph tags
// ────────────────────────────────────────────────────────────────────────────
(function testOpenGraphTags() {
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo,
  });

  assert(metadata.openGraph !== undefined, 'openGraph should be defined');
  assertEqual(metadata.openGraph!.title, 'Home | Test Forum', 'OG title should match full title');
  assertEqual(metadata.openGraph!.description, 'A test forum', 'OG description should match brand description');
  assertDeepEqual(metadata.openGraph!.images, ['https://example.com/logo.png'], 'OG images should include logo');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should include Twitter card tags
// ────────────────────────────────────────────────────────────────────────────
(function testTwitterCardTags() {
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo,
  });

  assert(metadata.twitter !== undefined, 'twitter should be defined');
  const twitter = metadata.twitter as Record<string, unknown>;
  assertEqual(twitter.card, 'summary', 'twitter card should be summary');
  assertEqual(twitter.title, 'Home | Test Forum', 'twitter title should match full title');
  assertEqual(twitter.description, 'A test forum', 'twitter description should match brand description');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should include favicon in icons
// ────────────────────────────────────────────────────────────────────────────
(function testFaviconInIcons() {
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo,
  });

  assert(metadata.icons !== undefined, 'icons should be defined');
  const icons = metadata.icons as Record<string, unknown>;
  assertEqual(icons.icon, 'https://example.com/favicon.ico', 'icon should use brand faviconUrl');
  assertEqual(icons.shortcut, 'https://example.com/favicon.ico', 'shortcut should use brand faviconUrl');
  assertEqual(icons.apple, 'https://example.com/favicon.ico', 'apple icon should use brand faviconUrl');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should fallback to /favicon.ico when no faviconUrl
// ────────────────────────────────────────────────────────────────────────────
(function testFaviconFallback() {
  const noFaviconBrand: BrandInfo = { ...brandInfo, faviconUrl: '' };
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo: noFaviconBrand,
  });

  const icons = metadata.icons as Record<string, unknown>;
  assertEqual(icons.icon, '/favicon.ico', 'icon should fallback to /favicon.ico');
  assertEqual(icons.shortcut, '/favicon.ico', 'shortcut should fallback to /favicon.ico');
  assertEqual(icons.apple, '/favicon.ico', 'apple icon should fallback to /favicon.ico');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should use path in Open Graph url
// ────────────────────────────────────────────────────────────────────────────
(function testOpenGraphUrl() {
  const metadata = generatePageMetadata({
    title: 'Resources',
    path: '/resources',
    brandInfo,
  });

  assertEqual(metadata.openGraph!.url, '/resources', 'OG url should use provided path');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should default path to /
// ────────────────────────────────────────────────────────────────────────────
(function testDefaultPath() {
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo,
  });

  assertEqual(metadata.openGraph!.url, '/', 'OG url should default to /');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should handle empty logoUrl gracefully (no images in OG)
// ────────────────────────────────────────────────────────────────────────────
(function testEmptyLogoUrl() {
  const noLogoBrand: BrandInfo = { ...brandInfo, logoUrl: '' };
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo: noLogoBrand,
  });

  assertDeepEqual(metadata.openGraph!.images, [], 'OG images should be empty when no logoUrl');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should include alternates.canonical from provided path
// ────────────────────────────────────────────────────────────────────────────
(function testAlternatesCanonical() {
  const metadata = generatePageMetadata({
    title: 'Resources',
    path: '/resources',
    brandInfo,
  });

  assert(metadata.alternates !== undefined, 'alternates should be defined');
  assertEqual(
    (metadata.alternates as { canonical?: string }).canonical,
    '/resources',
    'alternates.canonical should equal provided path',
  );
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: should default alternates.canonical to /
// ────────────────────────────────────────────────────────────────────────────
(function testAlternatesCanonicalDefault() {
  const metadata = generatePageMetadata({
    title: 'Home',
    brandInfo,
  });

  assertEqual(
    (metadata.alternates as { canonical?: string }).canonical,
    '/',
    'alternates.canonical should default to /',
  );
})();

assert(true, 'metadata spec executed');
