import { resourceDetailHref } from './resource-detail-href';

describe('resourceDetailHref', () => {
  it('uses the numeric detail ID when the resource also has a public UUID', () => {
    const resource = {
      id: 86,
      public_id: '86d6b66a-fa94-41d8-a5c4-7351945b55da',
      slug: 'power-schematic',
    };

    expect(resourceDetailHref(resource)).toBe('/resources/86-power-schematic');
  });
});
