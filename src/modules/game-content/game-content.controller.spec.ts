import { GameContentController } from './game-content.controller';

describe('GameContentController feed', () => {
  it('returns real featured resources from the shared public list filter', async () => {
    const gameContent = {
      list: jest.fn(async (type, query) => ({ data: query.featuredOnly ? [{ id: `${type}-featured`, createdAt: new Date('2026-09-24T00:00:00Z') }] : [], pagination: {} })),
    };
    const controller = new GameContentController(gameContent as any, {} as any);
    const response = await controller.feed('featured', '12');
    expect(gameContent.list).toHaveBeenCalledWith('blueprint', { sort: 'latest', limit: '12', featuredOnly: true });
    expect(gameContent.list).toHaveBeenCalledWith('map', { sort: 'latest', limit: '12', featuredOnly: true });
    expect(response.sections).toHaveLength(1);
    expect(response.sections[0]).toMatchObject({ type: 'featured', title: '精选内容' });
    expect(response.sections[0].items).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'blueprint-featured' }), expect.objectContaining({ id: 'map-featured' })]));
  });

  it('uses the persisted seven-day trending query instead of total download counts', async () => {
    const gameContent = { list: jest.fn().mockResolvedValue({ data: [], pagination: {} }) };
    const controller = new GameContentController(gameContent as any, {} as any);
    await controller.feed('trending', '8');
    expect(gameContent.list).toHaveBeenCalledWith('blueprint', { sort: 'trending', limit: '8' });
    expect(gameContent.list).toHaveBeenCalledWith('map', { sort: 'trending', limit: '8' });
  });
});
