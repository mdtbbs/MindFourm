import { ThreadWriteV1Controller } from './thread-write-v1.controller';

describe('ThreadWriteV1Controller', () => {
  const posts = { create: jest.fn(), update: jest.fn(), softDelete: jest.fn() };
  const replies = { createReplyForPost: jest.fn(), update: jest.fn(), softDelete: jest.fn() };
  const controller = new ThreadWriteV1Controller(posts as any, replies as any);
  const req = { user: { id: 7, role: 'user' }, headers: {}, ip: '127.0.0.1' };

  beforeEach(() => jest.clearAllMocks());

  it('projects a created thread without audit fields', async () => {
    posts.create.mockResolvedValue({ id: 12, title: 'hello', status: 'published', ip_address: '127.0.0.1', created_at: new Date('2026-01-02T03:04:05.000Z') });
    await expect(controller.createThread({ title: 'hello', content: 'body' }, req)).resolves.toEqual({
      id: 12, public_id: null, title: 'hello', status: 'published', created_at: '2026-01-02T03:04:05.000Z', updated_at: null,
    });
    expect(posts.create).toHaveBeenCalledWith({ title: 'hello', content: 'body' }, 7, expect.objectContaining({ ipAddress: '127.0.0.1' }));
  });

  it('routes a reply to the thread-specific service method', async () => {
    replies.createReplyForPost.mockResolvedValue({ id: 9, post_id: 12, content: 'reply', content_html: '<p>reply</p>', status: 'published', created_at: new Date('2026-01-02T03:04:05.000Z') });
    await expect(controller.createReply(12, { content: 'reply' }, req)).resolves.toMatchObject({ id: 9, post_id: 12, status: 'published' });
    expect(replies.createReplyForPost).toHaveBeenCalledWith(12, { content: 'reply' }, 7, expect.any(Object));
  });
});
