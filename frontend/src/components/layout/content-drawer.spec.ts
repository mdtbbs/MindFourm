/**
 * ContentDrawer layout spec
 *
 * Verifies that the mobile drawer uses the same height model as the desktop
 * sidebar: fixed viewport height with independent scrolling navigation,
 * shrink-0 header and user sections, and a flex-1 min-h-0 nav region.
 *
 * This spec runs as a plain Node script (no Jest/RTL setup needed),
 * following the same IIFE + assert pattern as other specs in the project.
 */

import { DRAWER_LAYOUT_CLASSES } from './content-drawer';

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

// ─── Panel — viewport height ────────────────────────────────────────────────

(function testPanelUsesViewportHeight() {
  const panelClasses = DRAWER_LAYOUT_CLASSES.panel;

  assertIncludes(
    panelClasses,
    'inset-y-0',
    'panel must span full viewport height (inset-y-0)',
  );
  assertIncludes(
    panelClasses,
    'flex-col',
    'panel must be a flex column so regions stack vertically',
  );
})();

// ─── Panel — overflow hidden via flex ───────────────────────────────────────

(function testPanelIsFlexColumn() {
  const panelClasses = DRAWER_LAYOUT_CLASSES.panel;

  assertIncludes(panelClasses, 'flex', 'panel must be a flex container');
  assertIncludes(
    panelClasses,
    'flex-col',
    'panel must stack children vertically (flex-col)',
  );
})();

// ─── Navigation region — scrollable ─────────────────────────────────────────

(function testNavIsScrollable() {
  const navClasses = DRAWER_LAYOUT_CLASSES.nav;

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
  const brandClasses = DRAWER_LAYOUT_CLASSES.brand;

  assertIncludes(
    brandClasses,
    'shrink-0',
    'brand section must not shrink — it stays fixed at the top',
  );
})();

// ─── User section — must not shrink ─────────────────────────────────────────

(function testUserSectionDoesNotShrink() {
  const userClasses = DRAWER_LAYOUT_CLASSES.user;

  assertIncludes(
    userClasses,
    'shrink-0',
    'user section must not shrink — it stays fixed at the bottom',
  );
})();

// ─── All required regions defined ───────────────────────────────────────────

(function testAllLayoutRegionsDefined() {
  assert(
    typeof DRAWER_LAYOUT_CLASSES.panel === 'string' &&
      DRAWER_LAYOUT_CLASSES.panel.length > 0,
    'panel classes must be a non-empty string',
  );
  assert(
    typeof DRAWER_LAYOUT_CLASSES.brand === 'string' &&
      DRAWER_LAYOUT_CLASSES.brand.length > 0,
    'brand classes must be a non-empty string',
  );
  assert(
    typeof DRAWER_LAYOUT_CLASSES.nav === 'string' &&
      DRAWER_LAYOUT_CLASSES.nav.length > 0,
    'nav classes must be a non-empty string',
  );
  assert(
    typeof DRAWER_LAYOUT_CLASSES.user === 'string' &&
      DRAWER_LAYOUT_CLASSES.user.length > 0,
    'user classes must be a non-empty string',
  );
})();

// ─── Drawer and sidebar models must match ───────────────────────────────────

(function testDrawerMatchesSidebarModel() {
  // The nav region must use the same three-token pattern as the sidebar:
  // flex-1 + min-h-0 + overflow-y-auto
  const requiredNavTokens = ['flex-1', 'min-h-0', 'overflow-y-auto'];
  for (const token of requiredNavTokens) {
    assertIncludes(
      DRAWER_LAYOUT_CLASSES.nav,
      token,
      `drawer nav must include "${token}" (matching sidebar height model)`,
    );
  }

  // Both brand and user sections must be shrink-0
  assertIncludes(
    DRAWER_LAYOUT_CLASSES.brand,
    'shrink-0',
    'drawer brand must be shrink-0 (matching sidebar)',
  );
  assertIncludes(
    DRAWER_LAYOUT_CLASSES.user,
    'shrink-0',
    'drawer user must be shrink-0 (matching sidebar)',
  );
})();

assert(true, 'content-drawer layout spec executed');
