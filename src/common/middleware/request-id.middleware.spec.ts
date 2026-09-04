import { requestIdMiddleware } from './request-id.middleware';

describe('requestIdMiddleware', () => {
  it('uses a valid inbound X-Request-Id and echoes it on the response', () => {
    const req: any = { headers: { 'x-request-id': 'req-inbound-42' }, header: function(name: string) { return this.headers[name.toLowerCase()]; } };
    const setHeader = jest.fn();
    const res: any = { setHeader };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('req-inbound-42');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-inbound-42');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when the inbound header is absent', () => {
    const req: any = { headers: {}, header: function() { return undefined; } };
    const res: any = { setHeader: jest.fn() };

    requestIdMiddleware(req, res, jest.fn());

    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
