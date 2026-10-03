import { UnifyResourceDiscussions1720000230000, legacyResourceCommentReplyStatus } from './1720000230000-UnifyResourceDiscussions';

describe('UnifyResourceDiscussions migration', () => {
  it('maps legacy visibility into forum reply statuses without changing the source table', () => {
    expect(legacyResourceCommentReplyStatus('visible')).toBe('published');
    expect(legacyResourceCommentReplyStatus('deleted')).toBe('deleted');
    expect(legacyResourceCommentReplyStatus('hidden')).toBe('pending');
  });

  it('copies content, author, likes and timestamps into Replies and preserves the legacy row', async () => {
    const comment = {
      id: 91,
      resource_id: 7,
      user_id: 12,
      parent_id: null,
      content: 'Historical comment',
      content_html: '<p>Historical comment</p>',
      status: 'visible',
      edited_at: new Date('2026-08-03T10:00:00.000Z'),
      upvote_count: 4,
      created_at: new Date('2026-08-01T10:00:00.000Z'),
      updated_at: new Date('2026-08-03T10:00:00.000Z'),
    };
    const resource = {
      id: 7, user_id: 3, title: 'Legacy map', description: 'Summary', content: 'Map author body',
      content_html: '<p>Map author body</p>', content_json: { type: 'doc', content: [] },
      content_schema_version: 2, content_text: 'Map author body', content_language: 'en',
      status: 'approved', is_public: 1, visibility: 'public', category_id: null,
      discussion_thread_id: null, created_at: new Date('2026-07-01T00:00:00.000Z'),
    };
    let commentsReturned = false;
    const calls: Array<{ sql: string; parameters?: any[] }> = [];
    const queryRunner = {
      startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
      query: jest.fn(async (sql: string, parameters?: any[]) => {
        calls.push({ sql, parameters });
        if (sql.includes('information_schema.tables')) return [{ exists: 1 }];
        if (sql.includes('information_schema.statistics')) return [];
        if (sql.includes('information_schema.columns')) return [{ exists: 1 }];
        if (sql.includes('FROM resource_comments rc')) {
          if (commentsReturned) return [];
          commentsReturned = true;
          return [comment];
        }
        if (sql.includes('FROM resources')) return [resource];
        if (sql.includes('INSERT INTO posts')) return { insertId: 501 };
        if (sql.includes('INSERT INTO replies')) return { insertId: 601 };
        return [];
      }),
    };

    await new UnifyResourceDiscussions1720000230000().up(queryRunner as any);

    const replyInsert = calls.find((call) => call.sql.includes('INSERT INTO replies'))!;
    expect(replyInsert.parameters).toEqual([
      501,
      12,
      'Historical comment',
      '<p>Historical comment</p>',
      'published',
      4,
      comment.created_at,
      comment.edited_at,
    ]);
    const postInsert = calls.find((call) => call.sql.includes('INSERT INTO posts'))!;
    expect(postInsert.parameters).toEqual([
      3,
      'Resource discussion: Legacy map',
      'Map author body',
      '<p>Map author body</p>',
      JSON.stringify({ type: 'doc', content: [] }),
      2,
      'Map author body',
      'en',
      'published',
      resource.created_at,
      resource.created_at,
      resource.created_at,
    ]);
    expect(calls.some((call) => call.sql.includes('INSERT INTO resource_comment_reply_map'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('CREATE INDEX `idx_resources_discussion_thread_id`'))).toBe(true);
    expect(calls.some((call) => call.sql.startsWith('UPDATE resources SET discussion_thread_id'))).toBe(true);
    expect(calls.some((call) => /(?:UPDATE|DELETE)\s+resource_comments\b/i.test(call.sql))).toBe(false);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
