import { ResourceOperationsController } from './resource-operations.controller';

describe('ResourceOperationsController', () => {
  function fixture(featured: boolean) {
    const operations = {
      setFeatured: jest.fn().mockResolvedValue({
        public_id: 'fixture-resource',
        is_featured: featured,
        resource: { id: 91, public_id: 'fixture-resource' },
      }),
      summary: jest.fn(),
    };
    const logs = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new ResourceOperationsController(operations as any, logs as any);
    const request = {
      user: { id: 7 },
      requestId: 'req_featured_123',
      headers: { 'user-agent': 'Playwright fixture' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    };
    return { controller, operations, logs, request };
  }

  it.each([
    [true, 'resource.featured.add'],
    [false, 'resource.featured.remove'],
  ] as const)('audits featured=%s with request correlation', async (featured, action) => {
    const { controller, operations, logs, request } = fixture(featured);

    await expect(controller.setFeatured('fixture-resource', { featured }, request)).resolves.toMatchObject({
      public_id: 'fixture-resource',
      is_featured: featured,
    });

    expect(operations.setFeatured).toHaveBeenCalledWith('fixture-resource', featured);
    expect(logs.log).toHaveBeenCalledTimes(1);
    const entry = logs.log.mock.calls[0][0];
    expect(entry).toMatchObject({
      user_id: 7,
      action,
      target_type: 'resource',
      target_id: 91,
      user_agent: 'Playwright fixture',
    });
    expect(JSON.parse(entry.details)).toEqual({
      public_id: 'fixture-resource',
      featured,
      request_id: 'req_featured_123',
    });
    expect(entry.ip_address).toBeTruthy();
  });
});
