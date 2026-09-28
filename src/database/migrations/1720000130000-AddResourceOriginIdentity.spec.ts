import { AddResourceOriginIdentity1720000130000 } from './1720000130000-AddResourceOriginIdentity';

describe('AddResourceOriginIdentity migration', () => {
  it('adds the unique nullable source identity index once', async () => {
    const resources = {
      findColumnByName: jest.fn(() => ({})),
      indices: [],
    };
    const queryRunner = {
      getTable: jest.fn().mockResolvedValue(resources),
      createIndex: jest.fn(),
    };

    await new AddResourceOriginIdentity1720000130000().up(queryRunner as any);

    expect(queryRunner.createIndex).toHaveBeenCalledWith('resources', expect.objectContaining({
      name: 'uq_resources_origin_identity',
      columnNames: ['origin_site', 'origin_resource_id'],
      isUnique: true,
    }));
  });
});
