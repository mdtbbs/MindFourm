/**
 * Settings Controller – unit tests
 *
 * Covers the HTTP-level contract that the brand-unification work relies on:
 *
 *  1. `GET /settings` returns only public (allow-listed) keys and always
 *     includes the six brand fields, even when absent from the database.
 *  2. `GET /settings/:category` narrows to one category but still filters
 *     out non-public keys (SMTP passwords, webhook secrets, …).
 *  3. `PUT /settings/brand` delegates to `setBatch('brand', …)` and triggers
 *     a Next.js revalidation when a public key is touched.
 *  4. Secret keys never appear in any public response.
 */

jest.mock('./settings-revalidation.service', () => ({
  SettingsRevalidationService: class SettingsRevalidationService {
    revalidatePublicSettings = jest.fn().mockResolvedValue(undefined);
  },
}));

jest.mock('./settings.service', () => ({
  SettingsService: class SettingsService {},
}));

import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SettingsRevalidationService } from './settings-revalidation.service';
import { UpdateBrandSettingsDto } from './dto/update-brand-settings.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUBLIC_BRAND_PAYLOAD: Record<string, string> = {
  site_name: 'Test Forum',
  site_tagline: 'A place for testing',
  site_description: 'Automated tests',
  site_logo_url: 'https://example.com/logo.png',
  site_favicon_url: 'https://example.com/favicon.ico',
  sidebar_title: 'Navigation',
};

function createController(overrides: {
  settingsService?: Partial<Record<keyof SettingsService, jest.Mock>>;
  revalidationService?: Partial<Record<keyof SettingsRevalidationService, jest.Mock>>;
} = {}) {
  const settingsService: Partial<Record<keyof SettingsService, jest.Mock>> = {
    getPublicSettings: jest.fn().mockResolvedValue({ ...PUBLIC_BRAND_PAYLOAD }),
    getPublicByCategory: jest.fn().mockResolvedValue({ site_name: 'Test Forum' }),
    hasPublicKeys: jest.fn().mockReturnValue(true),
    setBatch: jest.fn().mockResolvedValue(undefined),
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

describe('SettingsController', () => {
  // -----------------------------------------------------------------------
  // GET /settings  →  getPublicSettings()
  // -----------------------------------------------------------------------
  describe('GET /settings (getAll)', () => {
    it('returns the six brand fields', async () => {
      const { controller, settingsService } = createController();

      const result = await controller.getAll();

      expect(settingsService.getPublicSettings).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('site_name', 'Test Forum');
      expect(result).toHaveProperty('site_tagline', 'A place for testing');
      expect(result).toHaveProperty('site_description', 'Automated tests');
      expect(result).toHaveProperty('site_logo_url', 'https://example.com/logo.png');
      expect(result).toHaveProperty('site_favicon_url', 'https://example.com/favicon.ico');
      expect(result).toHaveProperty('sidebar_title', 'Navigation');
    });

    it('does not introduce extra keys beyond what the service returns', async () => {
      // The controller is a thin pass-through; the service is the security
      // boundary. Verify the controller does not wrap or augment the payload.
      const safePayload = { ...PUBLIC_BRAND_PAYLOAD };
      const { controller } = createController({
        settingsService: {
          getPublicSettings: jest.fn().mockResolvedValue(safePayload),
        } as any,
      });

      const result = await controller.getAll();

      // Result should be exactly what the service returned — no more, no less.
      expect(Object.keys(result).sort()).toEqual(Object.keys(safePayload).sort());
      expect(result).not.toHaveProperty('smtp_password');
      expect(result).not.toHaveProperty('admin_notifications_webhook_secret');
    });

    it('returns empty strings for brand fields missing from the database', async () => {
      const emptyBrand = {
        site_name: '',
        site_tagline: '',
        site_description: '',
        site_logo_url: '',
        site_favicon_url: '',
        sidebar_title: '',
      };
      const { controller } = createController({
        settingsService: {
          getPublicSettings: jest.fn().mockResolvedValue(emptyBrand),
        } as any,
      });

      const result = await controller.getAll();

      for (const key of Object.keys(emptyBrand)) {
        expect(result).toHaveProperty(key);
        expect(result[key]).toBe('');
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /settings/:category  →  getPublicByCategory()
  // -----------------------------------------------------------------------
  describe('GET /settings/:category (getByCategory)', () => {
    it('returns only public keys for the requested category', async () => {
      const { controller, settingsService } = createController({
        settingsService: {
          getPublicByCategory: jest.fn().mockResolvedValue({
            site_name: 'Test Forum',
            site_tagline: 'A place for testing',
          }),
        } as any,
      });

      const result = await controller.getByCategory('brand');

      expect(settingsService.getPublicByCategory).toHaveBeenCalledWith('brand');
      expect(result).toEqual({
        site_name: 'Test Forum',
        site_tagline: 'A place for testing',
      });
    });

    it('returns an empty object for credential-bearing categories', async () => {
      const { controller } = createController({
        settingsService: {
          getPublicByCategory: jest.fn().mockResolvedValue({}),
        } as any,
      });

      const result = await controller.getByCategory('email');

      expect(result).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // PUT /settings/brand  →  updateBrandSettings()
  // -----------------------------------------------------------------------
  describe('PUT /settings/brand (updateBrandSettings)', () => {
    it('delegates to setBatch with category "brand"', async () => {
      const { controller, settingsService } = createController();

      const dto = new UpdateBrandSettingsDto();
      dto.site_name = 'New Name';
      dto.site_tagline = 'New Tagline';

      const result = await controller.updateBrandSettings(dto);

      expect(settingsService.setBatch).toHaveBeenCalledWith('brand', {
        site_name: 'New Name',
        site_tagline: 'New Tagline',
      });
      expect(result).toEqual({ message: 'Settings updated' });
    });

    it('triggers revalidation when a public key is updated', async () => {
      const { controller, settingsService, revalidationService } = createController({
        settingsService: {
          hasPublicKeys: jest.fn().mockReturnValue(true),
          setBatch: jest.fn().mockResolvedValue(undefined),
        } as any,
      });

      const dto = new UpdateBrandSettingsDto();
      dto.site_name = 'Updated Name';

      await controller.updateBrandSettings(dto);

      // Object.keys(dto) includes all declared DTO properties (even undefined
      // optional ones) — the service checks the full set against PUBLIC_KEYS.
      expect(settingsService.hasPublicKeys).toHaveBeenCalledWith(
        expect.arrayContaining(['site_name']),
      );
      expect(revalidationService.revalidatePublicSettings).toHaveBeenCalledTimes(1);
    });

    it('skips revalidation when only non-public keys are updated', async () => {
      const { controller, settingsService, revalidationService } = createController({
        settingsService: {
          hasPublicKeys: jest.fn().mockReturnValue(false),
          setBatch: jest.fn().mockResolvedValue(undefined),
        } as any,
      });

      const dto = new UpdateBrandSettingsDto();
      // All brand fields ARE public, but let's test the false branch:
      (settingsService.hasPublicKeys as jest.Mock).mockReturnValue(false);

      await controller.updateBrandSettings(dto);

      expect(revalidationService.revalidatePublicSettings).not.toHaveBeenCalled();
    });

    it('passes through all six brand fields when provided', async () => {
      const { controller, settingsService } = createController();

      const dto = new UpdateBrandSettingsDto();
      dto.site_name = 'Forum';
      dto.site_tagline = 'Tagline';
      dto.site_description = 'Desc';
      dto.site_logo_url = 'https://example.com/logo.png';
      dto.site_favicon_url = 'https://example.com/favicon.ico';
      dto.sidebar_title = 'Nav';

      await controller.updateBrandSettings(dto);

      expect(settingsService.setBatch).toHaveBeenCalledWith('brand', {
        site_name: 'Forum',
        site_tagline: 'Tagline',
        site_description: 'Desc',
        site_logo_url: 'https://example.com/logo.png',
        site_favicon_url: 'https://example.com/favicon.ico',
        sidebar_title: 'Nav',
      });
    });
  });

  // -----------------------------------------------------------------------
  // PUT /settings/:category  →  updateSettings()
  // -----------------------------------------------------------------------
  describe('PUT /settings/:category (updateSettings)', () => {
    it('delegates to setBatch with the given category', async () => {
      const { controller, settingsService } = createController();

      const data = { site_footer: 'New footer' };

      const result = await controller.updateSettings('basic', data);

      expect(settingsService.setBatch).toHaveBeenCalledWith('basic', data);
      expect(result).toEqual({ message: 'Settings updated' });
    });

    it('triggers revalidation when public keys are in the payload', async () => {
      const { controller, settingsService, revalidationService } = createController();

      await controller.updateSettings('brand', { site_name: 'Updated' });

      expect(settingsService.hasPublicKeys).toHaveBeenCalledWith(['site_name']);
      expect(revalidationService.revalidatePublicSettings).toHaveBeenCalled();
    });
  });
});
