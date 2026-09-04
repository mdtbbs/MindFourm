import { getDefaultSidebarNavigation } from './sidebar-navigation-defaults';
import { SIDEBAR_ICON_WHITELIST } from './sidebar-navigation.util';

describe('Sidebar Navigation Defaults', () => {
  it('should return default navigation items', () => {
    const defaults = getDefaultSidebarNavigation();

    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults.some((item) => item.id === 'home')).toBe(true);
    expect(defaults.every((item) => item.enabled)).toBe(true);
  });

  it('should include home, categories, tags, and resources in defaults', () => {
    const defaults = getDefaultSidebarNavigation();
    const ids = defaults.map((item) => item.id);

    expect(ids).toContain('home');
    expect(ids).toContain('categories');
    expect(ids).toContain('tags');
    expect(ids).toContain('resources');
  });

  it('should have valid icons for all default items', () => {
    const defaults = getDefaultSidebarNavigation();

    defaults.forEach((item) => {
      expect(SIDEBAR_ICON_WHITELIST).toContain(item.icon);
    });
  });

  it('should have all default items with requiresAuth=false', () => {
    const defaults = getDefaultSidebarNavigation();
    expect(defaults.every((item) => item.requiresAuth === false)).toBe(true);
  });

  it('should have non-empty labels and hrefs for all default items', () => {
    const defaults = getDefaultSidebarNavigation();

    defaults.forEach((item) => {
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.href.trim().length).toBeGreaterThan(0);
    });
  });

  it('should return a fresh array on each call (no shared reference)', () => {
    const a = getDefaultSidebarNavigation();
    const b = getDefaultSidebarNavigation();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
