import { PortalService } from './portal.service';

describe('PortalService', () => {
  it('aggregates portal modules from multiple domains', async () => {
    const resourceRepo = { find: jest.fn().mockResolvedValue([{ id: 1, title: 'R1', slug: 'r1', created_at: new Date() }]) };
    const postRepo = { find: jest.fn().mockResolvedValue([{ id: 10, title: 'T1', slug: 't1', created_at: new Date() }]) };
    const knowledgeRepo = { find: jest.fn().mockResolvedValue([]) };
    const versionRepo = { find: jest.fn().mockResolvedValue([{ id: 1, version_value: '159', display_name: 'v159', game_series: 'stable' }]) };

    const service = new PortalService(resourceRepo as any, postRepo as any, knowledgeRepo as any, versionRepo as any);
    const result = await service.getPortalData();

    expect(result.modules).toHaveLength(4);
    expect(result.modules.find(m => m.key === 'latest_resources')!.hidden).toBe(false);
    expect(result.modules.find(m => m.key === 'knowledge')!.hidden).toBe(true); // empty = hidden
    expect(result.generated_at).toBeTruthy();
  });
});
