import { SIDEBAR_LAYOUT_CLASSES } from './content-sidebar';

describe('ContentSidebar layout', () => {
  test('keeps the shell viewport bound and lets only the navigation region scroll', () => {
    expect(SIDEBAR_LAYOUT_CLASSES.root).toContain('lg:h-[100dvh]');
    expect(SIDEBAR_LAYOUT_CLASSES.root).toContain('lg:overflow-hidden');
    expect(SIDEBAR_LAYOUT_CLASSES.root).not.toContain('lg:min-h-screen');
    expect(SIDEBAR_LAYOUT_CLASSES.nav).toContain('overflow-y-auto');
    expect(SIDEBAR_LAYOUT_CLASSES.nav).toContain('min-h-0');
  });

  test('keeps brand and user areas fixed while the navigation scrolls', () => {
    expect(SIDEBAR_LAYOUT_CLASSES.brand).toContain('shrink-0');
    expect(SIDEBAR_LAYOUT_CLASSES.user).toContain('shrink-0');
  });
});
