const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({ Injectable: decorator }));
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: decorator }));
jest.mock('typeorm', () => ({ Like: (value: string) => ({ value }) }));
jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));
jest.mock('@entities/game-server.entity', () => ({ GameServer: class GameServer {} }));
jest.mock('@entities/game-version.entity', () => ({ GameVersion: class GameVersion {} }));
jest.mock('@entities/developer-feed-entry.entity', () => ({ DeveloperFeedEntry: class DeveloperFeedEntry {} }));

import { MdtbbsResourceSearchProvider } from './mdtbbs-search.providers';

describe('MdtbbsResourceSearchProvider content-language relevance', () => {
  it('filters the requested language and ranks the preferred language ahead of other matches', async () => {
    const resource = {
      id: 12,
      title: 'Map pack',
      resource_type: 'upload',
      version: null,
      content_language: 'ru',
      slug: 'map-pack',
      download_count: 3,
      rating_average: 4.5,
      rating_count: 2,
      user_id: 7,
      created_at: new Date('2026-09-01T00:00:00Z'),
      category: { name: 'Maps' },
      user: { username: 'alice' },
    };
    const query = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      maxExecutionTime: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [resource], raw: [{ resource_card_description: 'Map pack summary' }] }),
      getCount: jest.fn().mockResolvedValue(1),
    };
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const provider = new MdtbbsResourceSearchProvider(repository as any, { register: jest.fn() } as any);

    const result = await provider.search('map', {
      limit: 10,
      content_language: 'ja',
      preferred_content_language: 'ru',
    });

    expect(query.andWhere).toHaveBeenCalledWith('r.content_language = :contentLanguage', { contentLanguage: 'ja' });
    expect(query.addSelect).toHaveBeenCalledWith(
      'CASE WHEN r.content_language = :preferredContentLanguage THEN 1 ELSE 0 END', 'search_language_match',
    );
    expect(query.setParameter).toHaveBeenCalledWith('preferredContentLanguage', 'ru');
    expect(query.orderBy).toHaveBeenCalledWith('search_language_match', 'DESC');
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.take).toHaveBeenCalledWith(10);
    expect(query.andWhere.mock.calls.some(([clause]) => String(clause).includes('MATCH(r.title, r.description, r.summary)'))).toBe(true);
    expect(result.items[0]).toMatchObject({ content_language: 'ru', description: 'Map pack summary' });
  });
});

describe('MdtbbsResourceSearchProvider unified dependency/compatibility filters', () => {
  function captureQueryBuilder() {
    const calls: string[] = [];
    const qb: any = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'getRawAndEntities') return jest.fn(async () => ({ entities: [], raw: [] }));
        if (prop === 'getCount') return jest.fn(async () => 0);
        return (...args: any[]) => {
          if (prop === 'andWhere' && typeof args[0] === 'string') calls.push(args[0]);
          return qb;
        };
      },
    });
    return { qb, calls };
  }

  it('dependency filter queries modern table first and guards legacy rows by legacy_source_id', async () => {
    const { qb, calls } = captureQueryBuilder();
    const repository = { createQueryBuilder: jest.fn(() => qb) };
    const provider = new MdtbbsResourceSearchProvider(repository as any, { register: jest.fn() } as any);

    await provider.search('anything', { limit: 10, page: 1, dependency: 'some-mod' } as any);

    const filter = calls.find((sql) => sql.includes('search_dependency'));
    expect(filter).toBeDefined();
    expect(filter).toContain('FROM resource_dependencies search_dependency_v2');
    expect(filter).toContain('FROM resource_version_dependencies search_dependency');
    expect(filter).toContain('search_dependency_copied.legacy_source_id = search_dependency.id');
  });

  it('game_version filter includes modern compatibilities and dedupes copied legacy rows', async () => {
    const { qb, calls } = captureQueryBuilder();
    const repository = { createQueryBuilder: jest.fn(() => qb) };
    const provider = new MdtbbsResourceSearchProvider(repository as any, { register: jest.fn() } as any);

    await provider.search('anything', { limit: 10, page: 1, game_version: '146' } as any);

    const filter = calls.find((sql) => sql.includes('search_compatibility'));
    expect(filter).toBeDefined();
    expect(filter).toContain('FROM resource_compatibilities search_compatibility');
    expect(filter).toContain('FROM resource_version_compatibilities search_compatibility');
    expect(filter).toContain('search_compatibility_copied.legacy_source_id = search_compatibility.id');
  });
});
