import { SHELF_ITEMS, buildDiscoveryShelves, type Recommendation } from './resource-discovery-shelves';

const item = (id: number, reasons: string[] = ['trending']): Recommendation => ({
  resource: { id, public_id: `pub-${id}`, title: `Resource ${id}` } as Recommendation['resource'],
  score: 1,
  reasons,
});

const section = (items: Recommendation[]) => ({ items });

describe('buildDiscoveryShelves', () => {
  test('keeps shelves in a stable priority order and drops empty ones', () => {
    const shelves = buildDiscoveryShelves({
      sections: {
        featured: section([]),
        trending: section([item(1), item(2)]),
        rising: section([item(3)]),
        top_rated: section([]),
        newest: section([item(4)]),
      },
    }, null);

    expect(shelves.map((shelf) => shelf.key)).toEqual(['trending', 'rising', 'newest']);
    expect(shelves[1].items.map((entry) => entry.resource.id)).toEqual([3]);
  });

  test('caps each shelf so one long list cannot push the grid up the page', () => {
    const many = Array.from({ length: 12 }, (_value, index) => item(index + 1));
    const shelves = buildDiscoveryShelves({
      sections: { featured: section(many), trending: section(many), rising: section(many), top_rated: section(many), newest: section(many) },
    }, null);

    for (const shelf of shelves) expect(shelf.items.length).toBe(SHELF_ITEMS);
  });

  test('drops duplicate resources inside a shelf', () => {
    const shelves = buildDiscoveryShelves({
      sections: { featured: section([item(1), item(1), item(2)]), trending: section([]), rising: section([]), top_rated: section([]), newest: section([]) },
    }, null);

    expect(shelves[0].items.map((entry) => entry.resource.id)).toEqual([1, 2]);
  });

  test('folds an anonymous for-you into trending instead of showing two identical shelves', () => {
    const trending = [item(1), item(2)];
    const shelves = buildDiscoveryShelves(
      { sections: { featured: section([]), trending: section(trending), rising: section([]), top_rated: section([]), newest: section([]) } },
      { personalized: false, items: [item(1), item(2)] },
    );

    expect(shelves.map((shelf) => shelf.key)).toEqual(['trending']);
    expect(shelves[0].items.map((entry) => entry.resource.id)).toEqual([1, 2]);
  });

  test('keeps a personalized for-you as its own leading shelf', () => {
    const shelves = buildDiscoveryShelves(
      { sections: { featured: section([item(9)]), trending: section([item(1)]), rising: section([]), top_rated: section([]), newest: section([]) } },
      { personalized: true, items: [item(7), item(8)] },
    );

    expect(shelves.map((shelf) => shelf.key)).toEqual(['for-you', 'featured', 'trending']);
    expect(shelves[0].items.map((entry) => entry.resource.id)).toEqual([7, 8]);
  });

  test('falls back to trending when a personalized for-you payload is empty', () => {
    const shelves = buildDiscoveryShelves(
      { sections: { featured: section([]), trending: section([item(1)]), rising: section([]), top_rated: section([]), newest: section([]) } },
      { personalized: true, items: [] },
    );

    expect(shelves.map((shelf) => shelf.key)).toEqual(['trending']);
  });

  test('returns nothing when both payloads are unavailable or empty', () => {
    expect(buildDiscoveryShelves(null, null)).toEqual([]);
    expect(buildDiscoveryShelves(null, { personalized: false, items: [] })).toEqual([]);
  });
});
