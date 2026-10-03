import { ResourceCommentsService } from './resource-comments.service';

describe('ResourceCommentsService forum adapter', () => {
  function setup() {
    const resourceRepo = { findOne: jest.fn() };
    const reply = {
      id: 13, post_id: 501, user_id: 8, parent_reply_id: 5, content: 'Reply',
      content_html: '<p>Reply</p>', content_json: { type: 'doc', content: [] }, content_schema_version: 2,
      status: 'published', like_count: 2,
      created_at: new Date('2026-09-01T00:00:00Z'), updated_at: new Date('2026-09-01T00:00:00Z'),
      user: { id: 8, username: 'member', avatar_url: '/avatar.png' },
    };
    const replyRepo = { findAndCount: jest.fn().mockResolvedValue([[reply], 1]), findOne: jest.fn() };
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM resources')) return [{
          id: 70, user_id: 7, title: 'Map', description: 'Short summary', content: 'Author-written resource body',
          content_html: '<p>Author-written resource body</p>',
          content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Author-written resource body' }] }] },
          content_schema_version: 2, content_text: 'Author-written resource body', content_language: 'en', status: 'approved',
          is_public: 1, visibility: 'public', category_id: null, discussion_thread_id: 501,
        }];
        if (sql.includes('FROM posts')) return [{ id: 501, status: 'published', post_type: 'resource_discussion', source: 'SYSTEM' }];
        return [];
      }),
    };
    const dataSource = { transaction: jest.fn(async (callback: any) => callback(manager)) };
    const replies = { createReplyForPost: jest.fn().mockResolvedValue(reply), update: jest.fn().mockResolvedValue(reply), softDelete: jest.fn() };
    const likes = { likeReply: jest.fn(), unlikeReply: jest.fn() };
    const service = new ResourceCommentsService(resourceRepo as any, replyRepo as any, dataSource as any, replies as any, likes as any);
    return { service, resourceRepo, replyRepo, manager, dataSource, replies, likes, reply };
  }

  it('reads a public resource discussion from canonical forum replies and exposes the full-thread link', async () => {
    const { service, replyRepo } = setup();

    const result = await service.findByResource(70, 1, 100);

    expect(replyRepo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
      where: { post_id: 501, status: 'published' }, skip: 0, take: 100,
    }));
    expect(result.data[0]).toMatchObject({
      id: 13, resource_id: 70, parent_id: 5, username: 'member', upvote_count: 2,
      content_json: { type: 'doc', content: [] }, content_schema_version: 2,
    });
    expect(result).toMatchObject({ discussion_thread_id: 501, discussion_thread_url: '/posts/501' });
    expect(result.pagination.total).toBe(1);
  });

  it('writes a comment through RepliesService with the canonical parent reply id', async () => {
    const { service, replies } = setup();

    await service.create(70, 9, { content: 'A reply', parent_comment_id: 5 } as any, { ipAddress: '192.0.2.1' });

    expect(replies.createReplyForPost).toHaveBeenCalledWith(
      501,
      { content: 'A reply', parent_reply_id: 5 },
      9,
      { ipAddress: '192.0.2.1' },
    );
  });

  it('creates the system resource header separately and seeds the initial thread body from author content', async () => {
    const { service, manager } = setup();
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM resources')) return [{
        id: 70, user_id: 7, title: 'Map', description: 'Short summary', content: 'Author-written resource body',
        content_html: '<p>Author-written resource body</p>',
        content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Author-written resource body' }] }] },
        content_schema_version: 2, content_text: 'Author-written resource body', content_language: 'en',
        status: 'approved', is_public: 1, visibility: 'public', category_id: null, discussion_thread_id: null,
      }];
      if (sql.includes('FROM posts')) return [];
      if (sql.includes('INSERT INTO posts')) return { insertId: 502 };
      return [];
    });

    const result = await service.findByResource(70);

    expect(result.discussion_thread_id).toBe(502);
    const insertCall = manager.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO posts'));
    expect(insertCall?.[1]).toEqual(expect.arrayContaining([
      'Resource discussion: Map',
      'Author-written resource body',
      '<p>Author-written resource body</p>',
      JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Author-written resource body' }] }] }),
    ]));
  });

  it('routes updates, deletes and likes only for replies that belong to a resource thread', async () => {
    const { service, resourceRepo, replyRepo, replies, likes } = setup();
    replyRepo.findOne.mockResolvedValue({ id: 13, post_id: 501 });
    resourceRepo.findOne.mockResolvedValue({
      id: 70, discussion_thread_id: 501, is_public: 1, status: 'approved',
      visibility: 'public', category_id: null,
    });

    await service.update(13, 8, { content: 'Edited' } as any, 'user');
    await service.delete(13, 8, 'user');
    await service.incrementLike(13, 8);
    await service.decrementLike(13, 8);

    expect(replies.update).toHaveBeenCalledWith(13, 'Edited', 8, 'user');
    expect(replies.softDelete).toHaveBeenCalledWith(13, 8, 'user');
    expect(likes.likeReply).toHaveBeenCalledWith(8, 13);
    expect(likes.unlikeReply).toHaveBeenCalledWith(8, 13);
  });
});
