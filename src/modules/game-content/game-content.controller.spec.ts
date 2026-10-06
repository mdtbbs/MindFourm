import { GameContentController } from './game-content.controller';

describe('GameContentController feed', () => {
  it('redirects a granted RES map without streaming through the forum', async () => {
    const target = { resource: { id: 1 }, version: { id: 2 }, file: { id: 3, storage_backend: 'res' }, externalUrl: 'https://res.example/o/object/map.msav', path: null };
    const gameContent = { prepareMapDownload: jest.fn().mockResolvedValue(target), recordDownloadLifecycle: jest.fn().mockResolvedValue(undefined) };
    const controller = new GameContentController(gameContent as any, {} as any);
    const response = { redirect: jest.fn(), setHeader: jest.fn() };
    await controller.mapDownloadFile('map-id', { headers: {}, user: { id: 5 } } as any, response as any);
    expect(gameContent.prepareMapDownload).toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.redirect).toHaveBeenCalledWith('https://res.example/o/object/map.msav');
  });

  it('redirects RES previews while leaving legacy buffer responses available', async () => {
    const gameContent = { preview: jest.fn().mockResolvedValue({ redirectUrl: 'https://res.example/o/preview/preview.png' }) };
    const controller = new GameContentController(gameContent as any, {} as any);
    const response = { redirect: jest.fn(), setHeader: jest.fn(), send: jest.fn() };
    await controller.mapPreview('map-id', response as any);
    expect(response.redirect).toHaveBeenCalledWith('https://res.example/o/preview/preview.png');
    expect(response.send).not.toHaveBeenCalled();
  });

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
