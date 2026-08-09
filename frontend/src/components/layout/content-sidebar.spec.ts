/**
 * ContentSidebar layout spec
 *
 * Verifies that the desktop sidebar uses fixed viewport height (`100dvh`)
 * and independent scrolling, not `min-h-screen` which causes the whole
 * page to scroll when the nav list is long.
 *
 * This spec runs as a plain Node script (no Jest/RTL setup needed),
 * following the same IIFE + assert pattern as other specs in the project.
 */

import { SIDEBAR_LAYOUT_CLASSES } from './content-sidebar';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}\nExpected "${haystack}" to include "${needle}"`);
  }
}

function assertNotIncludes(haystack: string, needle: string, message: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`${message}\nExpected "${haystack}" NOT to include "${needle}"`);
  }
}

// ─── Root aside — viewport height ───────────────────────────────────────────

(function testRootUsesViewportHeight() {
  const rootClasses = SIDEBAR_LAYOUT_CLASSES.root;

  assertIncludes(
    rootClasses,
    'lg:h-[100dvh]',
    'root aside must use fixed viewport height at lg breakpoint',
  );
  assertNotIncludes(
    rootClasses,
    'lg:min-h-screen',
    'root aside must NOT use min-h-screen (causes page-level scroll)',
  );
})();

// ─── Root aside — overflow hidden ───────────────────────────────────────────

(function testRootHasOverflowHidden() {
  const rootClasses = SIDEBAR_LAYOUT_CLASSES.root;

  assertIncludes(
    rootClasses,
    'lg:overflow-hidden',
    'root aside must clip overflow so only the nav region scrolls',
  );
})();

// ─── Root aside — flex column + sticky ──────────────────────────────────────

(function testRootIsStickyFlexColumn() {
  const rootClasses = SIDEBAR_LAYOUT_CLASSES.root;

  assertIncludes(rootClasses, 'lg:flex', 'root must be visible as flex at lg');
  assertIncludes(rootClasses, 'lg:flex-col', 'root must stack children vertically');
  assertIncludes(rootClasses, 'lg:sticky', 'root must be sticky');
  assertIncludes(rootClasses, 'lg:top-0', 'root must pin to top');
})();

// ─── Navigation region — scrollable ─────────────────────────────────────────

(function testNavIsScrollable() {
  const navClasses = SIDEBAR_LAYOUT_CLASSES.nav;

  assertIncludes(
    navClasses,
    'overflow-y-auto',
    'nav must scroll vertically when content exceeds available height',
  );
  assertIncludes(
    navClasses,
    'flex-1',
    'nav must grow to fill available space between brand and user sections',
  );
  assertIncludes(
    navClasses,
    'min-h-0',
    'nav must set min-h-0 so flex allows it to shrink below content size',
  );
})();

// ─── Brand section — must not shrink ────────────────────────────────────────

(function testBrandSectionDoesNotShrink() {
  const brandClasses = SIDEBAR_LAYOUT_CLASSES.brand;

  assertIncludes(
    brandClasses,
    'shrink-0',
    'brand section must not shrink — it stays fixed at the top',
  );
})();

// ─── User section — must not shrink ─────────────────────────────────────────

(function testUserSectionDoesNotShrink() {
  const userClasses = SIDEBAR_LAYOUT_CLASSES.user;

  assertIncludes(
    userClasses,
    'shrink-0',
    'user section must not shrink — it stays fixed at the bottom',
  );
})();

// ─── All required regions defined ───────────────────────────────────────────

(function testAllLayoutRegionsDefined() {
  assert(
    typeof SIDEBAR_LAYOUT_CLASSES.root === 'string' && SIDEBAR_LAYOUT_CLASSES.root.length > 0,
    'root classes must be a non-empty string',
  );
  assert(
    typeof SIDEBAR_LAYOUT_CLASSES.brand === 'string' && SIDEBAR_LAYOUT_CLASSES.brand.length > 0,
    'brand classes must be a non-empty string',
  );
  assert(
    typeof SIDEBAR_LAYOUT_CLASSES.nav === 'string' && SIDEBAR_LAYOUT_CLASSES.nav.length > 0,
    'nav classes must be a non-empty string',
  );
  assert(
    typeof SIDEBAR_LAYOUT_CLASSES.user === 'string' && SIDEBAR_LAYOUT_CLASSES.user.length > 0,
    'user classes must be a non-empty string',
  );
})();

assert(true, 'content-sidebar layout spec executed');
