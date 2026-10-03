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
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [resource], raw: [{ resource_card_description: 'Map pack summary' }] }),
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
    expect(result.items[0]).toMatchObject({ content_language: 'ru', description: 'Map pack summary' });
  });
});
