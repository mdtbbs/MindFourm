import { csrfMiddleware } from './csrf.middleware';

function createResponse() {
  return {
    cookie: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('csrfMiddleware', () => {
  it('rejects write requests without a matching header token', () => {
    const req: any = {
      method: 'POST',
      path: '/api/posts',
      headers: { cookie: 'csrf_token=known-token' },
    };
    const res = createResponse();
    const next = jest.fn();

    csrfMiddleware(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows write requests with a matching header token', () => {
    const req: any = {
      method: 'DELETE',
      path: '/api/posts/1',
      headers: {
        cookie: 'csrf_token=known-token',
        'x-csrf-token': 'known-token',
      },
    };
    const res = createResponse();
    const next = jest.fn();

    csrfMiddleware(req, res as any, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it.each([
    '/api/v1/auth/mobile/exchange',
    '/api/v1/auth/mobile/refresh',
    '/api/v1/auth/mobile/logout',
  ])('allows the reviewed native mobile route without a browser CSRF token: %s', (path) => {
    const req: any = { method: 'POST', path, headers: {} };
    const res = createResponse();
    const next = jest.fn();

    csrfMiddleware(req, res as any, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('allows an Android bearer write without a browser cookie token', () => {
    const req: any = { method: 'POST', path: '/api/v1/threads', headers: { authorization: 'Bearer mobile-token', 'x-client-platform': 'android' } };
    const res = createResponse(); const next = jest.fn();
    csrfMiddleware(req, res as any, next);
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('keeps a browser write CSRF-protected when its platform marker is absent', () => {
    const req: any = { method: 'POST', path: '/api/v1/threads', headers: { authorization: 'Bearer browser-token' } };
    const res = createResponse(); const next = jest.fn();
    csrfMiddleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
