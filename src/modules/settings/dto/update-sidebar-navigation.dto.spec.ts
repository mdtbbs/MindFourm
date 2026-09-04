import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSidebarNavigationDto } from './update-sidebar-navigation.dto';

/**
 * Helper: create a DTO from a plain object (mimics NestJS ValidationPipe).
 */
function createDto(plain: Record<string, any>): UpdateSidebarNavigationDto {
  return plainToInstance(UpdateSidebarNavigationDto, plain);
}

describe('UpdateSidebarNavigationDto', () => {
  it('accepts valid navigation items', async () => {
    const dto = createDto({
      items: [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts items with optional featureKey', async () => {
    const dto = createDto({
      items: [
        {
          id: 'servers',
          label: '服务器',
          href: '/servers',
          icon: 'Map',
          enabled: true,
          requiresAuth: false,
          featureKey: 'feature_servers_enabled',
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects non-array items', async () => {
    const dto = createDto({ items: 'not an array' });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('items');
  });

  it('rejects items with non-boolean enabled field', async () => {
    const dto = createDto({
      items: [
        {
          id: 'home',
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: 'true',
          requiresAuth: false,
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects items with non-string id', async () => {
    const dto = createDto({
      items: [
        {
          id: 123,
          label: '首页',
          href: '/',
          icon: 'Home',
          enabled: true,
          requiresAuth: false,
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects missing items field', async () => {
    const dto = createDto({});

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('items');
  });
});
