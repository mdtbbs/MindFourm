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
});
