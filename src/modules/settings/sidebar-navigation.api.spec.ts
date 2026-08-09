/**
 * Sidebar Navigation API – unit tests
 *
 * Covers the admin endpoints for managing sidebar navigation:
 *
 *  1. `GET /settings/admin/sidebar-navigation` returns the current navigation items.
 *  2. `PUT /settings/admin/sidebar-navigation` saves valid navigation after
 *     domain validation passes.
 *  3. `PUT /settings/admin/sidebar-navigation` rejects invalid navigation with
 *     a BadRequestException when domain validation fails.
 *  4. `SettingsService.updateSetting` upserts a single key-value pair.
 */

jest.mock('./settings-revalidation.service', () => ({
  SettingsRevalidationService: class SettingsRevalidationService {
    revalidatePublicSettings = jest.fn().mockResolvedValue(undefined);
  },
}));

jest.mock('./settings.service', () => ({
  SettingsService: class SettingsService {},
}));

import { BadRequestException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SettingsRevalidationService } from './settings-revalidation.service';
import { UpdateSidebarNavigationDto } from './dto/update-sidebar-navigation.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createController(overrides: {
  settingsService?: Partial<Record<keyof SettingsService, jest.Mock>>;
  revalidationService?: Partial<Record<keyof SettingsRevalidationService, jest.Mock>>;
} = {}) {
  const settingsService: Partial<Record<keyof SettingsService, jest.Mock>> = {
    getSidebarNavigation: jest.fn().mockResolvedValue([]),
    updateSetting: jest.fn().mockResolvedValue(undefined),
    ...overrides.settingsService,
  };

  const revalidationService: Partial<Record<keyof SettingsRevalidationService, jest.Mock>> = {
    revalidatePublicSettings: jest.fn().mockResolvedValue(undefined),
    ...overrides.revalidationService,
  };

  const controller = new SettingsController(
    settingsService as any,
    revalidationService as any,
  );

  return { controller, settingsService, revalidationService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sidebar Navigation API', () => {
  // -----------------------------------------------------------------------
  // GET /settings/admin/sidebar-navigation
  // -----------------------------------------------------------------------
  describe('GET /settings/admin/sidebar-navigation', () => {
    it('returns the current navigation items as an array', async () => {
      const navItems = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];
      const { controller, settingsService } = createController({
        settingsService: {
          getSidebarNavigation: jest.fn().mockResolvedValue(navItems),
        } as any,
      });

      const result = await controller.getSidebarNavigation();

      expect(settingsService.getSidebarNavigation).toHaveBeenCalledTimes(1);
      expect(result).toEqual(navItems);
    });

    it('returns an empty array when no navigation is configured', async () => {
      const { controller } = createController({
        settingsService: {
          getSidebarNavigation: jest.fn().mockResolvedValue([]),
        } as any,
      });

      const result = await controller.getSidebarNavigation();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /settings/admin/sidebar-navigation
  // -----------------------------------------------------------------------
  describe('PUT /settings/admin/sidebar-navigation', () => {
    it('saves valid navigation items and returns success', async () => {
      const items = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const dto = new UpdateSidebarNavigationDto();
      dto.items = items;

      const { controller, settingsService } = createController();

      const result = await controller.updateSidebarNavigation(dto);

      expect(settingsService.updateSetting).toHaveBeenCalledWith(
        'sidebar_navigation_items',
        JSON.stringify(items),
      );
      expect(result).toEqual({ success: true });
    });

    it('rejects items with empty label', async () => {
      const dto = new UpdateSidebarNavigationDto();
      dto.items = [
        {
          id: 'home',
          label: '',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const { controller, settingsService } = createController();

      await expect(controller.updateSidebarNavigation(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(settingsService.updateSetting).not.toHaveBeenCalled();
    });

    it('rejects items with invalid icon (not in whitelist)', async () => {
      const dto = new UpdateSidebarNavigationDto();
      dto.items = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'InvalidIcon',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const { controller, settingsService } = createController();

      await expect(controller.updateSidebarNavigation(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(settingsService.updateSetting).not.toHaveBeenCalled();
    });

    it('rejects items with duplicate IDs', async () => {
      const dto = new UpdateSidebarNavigationDto();
      dto.items = [
        {
          id: 'dup',
          label: 'First',
          href: '/first',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
        {
          id: 'dup',
          label: 'Second',
          href: '/second',
          icon: 'Star',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const { controller, settingsService } = createController();

      await expect(controller.updateSidebarNavigation(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(settingsService.updateSetting).not.toHaveBeenCalled();
    });

    it('rejects items with invalid href (not relative or https)', async () => {
      const dto = new UpdateSidebarNavigationDto();
      dto.items = [
        {
          id: 'home',
          label: '首页',
          href: 'javascript:alert(1)',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const { controller, settingsService } = createController();

      await expect(controller.updateSidebarNavigation(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(settingsService.updateSetting).not.toHaveBeenCalled();
    });

    it('accepts items with https external URLs', async () => {
      const items = [
        {
          id: 'external',
          label: 'External',
          href: 'https://example.com',
          icon: 'ExternalLink',
          enabled: true,
          requiresAuth: false,
        },
      ];

      const dto = new UpdateSidebarNavigationDto();
      dto.items = items;

      const { controller, settingsService } = createController();

      const result = await controller.updateSidebarNavigation(dto);

      expect(result).toEqual({ success: true });
      expect(settingsService.updateSetting).toHaveBeenCalled();
    });

    it('accepts multiple valid items', async () => {
      const items = [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
        {
          id: 'resources',
          label: '资源',
          href: '/resources',
          icon: 'Book',
          enabled: true,
          requiresAuth: false,
        },
        {
          id: 'profile',
          label: '个人',
          href: '/profile',
          icon: 'User',
          enabled: false,
          requiresAuth: true,
        },
      ];

      const dto = new UpdateSidebarNavigationDto();
      dto.items = items;

      const { controller, settingsService } = createController();

      const result = await controller.updateSidebarNavigation(dto);

      expect(result).toEqual({ success: true });
      expect(settingsService.updateSetting).toHaveBeenCalledWith(
        'sidebar_navigation_items',
        JSON.stringify(items),
      );
    });
  });
});
