import { ValidationPipe } from '@nestjs/common';
import {
  ResourceDiscoveryHomeQueryDto,
  ResourceDiscoveryHotQueryDto,
  ResourceDiscoveryQueryDto,
  ResourceDiscoveryRelatedQueryDto,
} from './resource-discovery.dto';

describe('resource discovery query DTOs', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  async function parse<T>(metatype: new () => T, value: Record<string, unknown>): Promise<T> {
    return pipe.transform(value, { type: 'query', metatype }) as Promise<T>;
  }

  it.each([
    ['home', ResourceDiscoveryHomeQueryDto, { kind: 'map', limit: '2', page: '3' }, { kind: 'map', limit: 2, page: 3 }],
    ['for-you', ResourceDiscoveryQueryDto, { kind: 'schematic', limit: '4', page: '2' }, { kind: 'schematic', limit: 4, page: 2 }],
    ['hot', ResourceDiscoveryHotQueryDto, { limit: '5', page: '4' }, { limit: 5, page: 4 }],
    ['related', ResourceDiscoveryRelatedQueryDto, { limit: '6', page: '5' }, { limit: 6, page: 5 }],
  ])('transforms URL query strings for %s into validated numbers', async (_name, metatype, value, expected) => {
    await expect(parse(metatype, value)).resolves.toMatchObject(expected);
  });

  it('continues to reject query numbers outside the documented limits', async () => {
    await expect(parse(ResourceDiscoveryHomeQueryDto, { limit: '21', page: '1' })).rejects.toThrow();
    await expect(parse(ResourceDiscoveryRelatedQueryDto, { limit: '1', page: '401' })).rejects.toThrow();
  });
});
