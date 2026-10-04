import { classifySecurityAccess, SecurityAccessLogsMiddleware } from './security-access-logs.middleware';

describe('security access log route policy', () => {
  it('logs resource detail and download without retaining query parameters', () => {
    expect(classifySecurityAccess('/api/resources/92/download/file?token=secret', 'GET', 200)).toEqual({
      route: '/api/resources/:resourceId/download', resource_type: 'resource', resource_id: '92',
    });
    expect(classifySecurityAccess('/api/resources/92?email=private', 'GET', 200)?.route).toBe('/api/resources/:resourceId');
  });

  it('records admin access, authentication entry points, and failed public API requests', () => {
    expect(classifySecurityAccess('/api/admin/users/42?email=private', 'GET', 200)?.route).toBe('/api/admin/users/:id');
    expect(classifySecurityAccess('/api/auth/login?password=secret', 'POST', 401)?.route).toBe('/api/auth/login');
    expect(classifySecurityAccess('/api/v1/messages?cursor=opaque', 'GET', 403)?.route).toBe('/api/v1/messages');
    expect(classifySecurityAccess('/api/v1/messages', 'GET', 200)).toBeNull();
  });

  it('ignores ordinary pages and static files', () => {
    expect(classifySecurityAccess('/resources/maps', 'GET', 200)).toBeNull();
    expect(classifySecurityAccess('/uploads/avatars/42.webp', 'GET', 200)).toBeNull();
    expect(classifySecurityAccess('/api/auth/check', 'GET', 200)).toBeNull();
  });

  it('persists the matched request after response completion without query data', () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const middleware = new SecurityAccessLogsMiddleware({ record } as any);
    const listeners: Record<string, () => void> = {};
    const request: any = {
      path: '/api/resources/7?token=secret', method: 'GET', requestId: 'req-7', clientIp: '198.51.100.7',
      headers: { 'user-agent': 'test agent' }, user: { id: 3 },
    };
    const response: any = { statusCode: 200, once: (event: string, handler: () => void) => { listeners[event] = handler; } };
    const next = jest.fn();
    middleware.use(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    listeners.finish();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-7', user_id: 3, route: '/api/resources/:resourceId', resource_id: '7',
      ip_address: '198.51.100.7', status_code: 200,
    }));
    expect(JSON.stringify(record.mock.calls)).not.toContain('secret');
  });
});
