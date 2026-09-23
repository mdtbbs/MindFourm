import { PortalSectionRegistry } from './portal-section.registry';

describe('PortalSectionRegistry', () => {
  it('dispatches section reads to the registered provider', async () => {
    const registry = new PortalSectionRegistry();
    const provider = { keys: ['resources'], getSection: jest.fn().mockResolvedValue([{ id: 4 }]) };
    registry.register(provider);
    await expect(registry.getSection('resources')).resolves.toEqual([{ id: 4 }]);
    expect(provider.getSection).toHaveBeenCalledWith('resources');
  });

  it('returns an empty section when no provider is installed', async () => {
    await expect(new PortalSectionRegistry().getSection('servers')).resolves.toEqual([]);
  });

  it('rejects overlapping section registrations', () => {
    const registry = new PortalSectionRegistry();
    registry.register({ keys: ['resources'], getSection: jest.fn() });
    expect(() => registry.register({ keys: ['resources'], getSection: jest.fn() }))
      .toThrow('Duplicate portal section provider: resources');
  });
});
