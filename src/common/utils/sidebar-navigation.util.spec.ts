import {
  validateSidebarNavigation,
  normalizeSidebarNavigation,
  SidebarNavigationItem,
} from './sidebar-navigation.util';

describe('Sidebar Navigation Validation', () => {
  describe('validateSidebarNavigation', () => {
    it('should accept valid navigation items', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject items with empty label', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Item "home" has empty label');
    });

    it('should reject items with empty href', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: '',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Item "home" has empty href');
    });

    it('should reject duplicate IDs', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
        {
          id: 'home',
          label: '首页 2',
          href: '/home',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate ID'))).toBe(true);
    });

    it('should reject invalid icon names', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'InvalidIcon' as any,
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid icon'))).toBe(true);
    });

    it('should reject javascript: URLs', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: 'javascript:alert(1)',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid href'))).toBe(true);
    });

    it('should reject data: URIs', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: 'data:text/html,<script>alert(1)</script>',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid href'))).toBe(true);
    });

    it('should accept relative paths', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: '/home',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(true);
    });

    it('should accept whitelisted https: URLs', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'external',
          label: 'External',
          href: 'https://example.com',
          icon: 'ExternalLink',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = validateSidebarNavigation(items);
      expect(result.valid).toBe(true);
    });
  });

  describe('normalizeSidebarNavigation', () => {
    it('should return empty array for null/undefined', () => {
      expect(normalizeSidebarNavigation(null)).toEqual([]);
      expect(normalizeSidebarNavigation(undefined)).toEqual([]);
    });

    it('should return empty array for invalid JSON string', () => {
      expect(normalizeSidebarNavigation('not json')).toEqual([]);
    });

    it('should parse valid JSON string', () => {
      const json = JSON.stringify([
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ]);

      const result = normalizeSidebarNavigation(json);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('home');
    });

    it('should return array as-is if already array', () => {
      const items: SidebarNavigationItem[] = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const result = normalizeSidebarNavigation(items);
      expect(result).toEqual(items);
    });
  });
});
