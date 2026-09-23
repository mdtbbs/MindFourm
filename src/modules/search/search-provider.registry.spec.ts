import { SearchProviderRegistry } from './search-provider.registry';

describe('SearchProviderRegistry', () => {
  it('delegates to a registered provider and returns its result group', async () => {
    const registry = new SearchProviderRegistry();
    const provider = { key: 'resources', search: jest.fn().mockResolvedValue({ items: [{ id: 1 }] }) };
    registry.register(provider);

    await expect(registry.search('resources', 'map', { limit: 5 })).resolves.toEqual([{ id: 1 }]);
    expect(provider.search).toHaveBeenCalledWith('map', { limit: 5 });
  });

  it('returns an empty group when a profile has no provider for a key', async () => {
    await expect(new SearchProviderRegistry().search('servers', 'map', { limit: 5 })).resolves.toEqual([]);
  });

  it('rejects duplicate provider keys', () => {
    const registry = new SearchProviderRegistry();
    const provider = { key: 'users', search: jest.fn() };
    registry.register(provider);
    expect(() => registry.register(provider)).toThrow('Duplicate search provider: users');
  });
});
