import { DataSource } from 'typeorm';
import { ResourcesV2WriteService } from './resources-v2-write.service';

describe('ResourcesV2WriteService resource relations', () => {
  function createService() {
    const service = new ResourcesV2WriteService({} as DataSource, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'assertRole').mockResolvedValue('owner');
    return service;
  }

  it('requires fork and successor relations to point to the same resource type and a specific target version', async () => {
    const service = createService();
    const source = { id: 10, resource_kind: 'schematic' };
    const target = { id: 11, resource_kind: 'schematic', is_public: 1, status: 'approved' };
    jest.spyOn(service as any, 'getResource').mockResolvedValueOnce(source).mockResolvedValueOnce(target);

    await expect(service.createRelation('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', {
      target_resource_public_id: '84b37577-d086-4897-a866-658e29e0bd09', relation_type: 'fork_of',
    }, 1)).rejects.toThrow('必须指定目标版本');
  });

  it('rejects cross-kind fork links', async () => {
    const service = createService();
    jest.spyOn(service as any, 'getResource')
      .mockResolvedValueOnce({ id: 10, resource_kind: 'schematic' })
      .mockResolvedValueOnce({ id: 11, resource_kind: 'map', is_public: 1, status: 'approved' });

    await expect(service.createRelation('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', {
      target_resource_public_id: '84b37577-d086-4897-a866-658e29e0bd09', relation_type: 'successor_of',
      target_version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9',
    }, 1)).rejects.toThrow('必须连接相同类型的资源');
  });

  it('rejects arbitrary relation values outside the documented V2 relation contract', async () => {
    const service = createService();
    jest.spyOn(service as any, 'getResource')
      .mockResolvedValueOnce({ id: 10, resource_kind: 'mod' })
      .mockResolvedValueOnce({ id: 11, resource_kind: 'mod', is_public: 1, status: 'approved' });

    await expect(service.createRelation('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', {
      target_resource_public_id: '84b37577-d086-4897-a866-658e29e0bd09', relation_type: 'inject_sql',
    }, 1)).rejects.toThrow('关联类型无效');
  });
});
