import { DataSource, EntitySchema } from 'typeorm';
import { SearchService } from './search.service';

describe('search SQL construction with joined pagination', () => {
  it('uses a selected relevance alias accepted by TypeORM pagination', async () => {
    const user = new EntitySchema({ name: 'SearchUser', tableName: 'users', columns: { id: { type: Number, primary: true } } });
    const category = new EntitySchema({ name: 'SearchCategory', tableName: 'categories', columns: { id: { type: Number, primary: true } } });
    const post = new EntitySchema({ name: 'SearchPost', tableName: 'posts', columns: {
      id: { type: Number, primary: true }, created_at: { type: Date },
    }, relations: {
      user: { type: 'many-to-one', target: 'SearchUser', joinColumn: true },
      category: { type: 'many-to-one', target: 'SearchCategory', joinColumn: true },
    } });
    const ds = new DataSource({ type: 'mysql', database: 'metadata_only', entities: [user, category, post] });
    await (ds as any).buildMetadatas(); // No database connection is opened.
    const qb = ds.getRepository(post).createQueryBuilder('p');
    qb.getRawAndEntities = jest.fn().mockResolvedValue({ entities: [], raw: [] });
    qb.getCount = jest.fn().mockResolvedValue(0);
    const service = new SearchService({ createQueryBuilder: () => qb } as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, { toSummaryList: async () => [] } as any);
    await service.searchPosts('地图', { sort: 'relevance', limit: 20 });
    expect(() => (qb as any).createOrderByCombinedWithSelectExpression('distinctAlias')).not.toThrow();
    expect((qb as any).createOrderByCombinedWithSelectExpression('distinctAlias')[0]).toContain('`distinctAlias`.`search_title_match`');
    expect(qb.getQueryAndParameters()[1]).toContain('%地图%');
  });
});
