import { MigrationInterface, QueryRunner } from 'typeorm';
import { createIndexIfMissing, dropIndexIfPresent, tableExists } from './migration-utils';

type LegacyResourceComment = {
  id: number;
  resource_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  content_html: string | null;
  status: string;
  edited_at: Date | string | null;
  upvote_count: number | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ResourceDiscussionRow = {
  id: number;
  user_id: number;
  title: string;
  description?: string | null;
  content?: string | null;
  content_html?: string | null;
  content_json?: unknown;
  content_schema_version?: number | null;
  content_text?: string | null;
  content_language: string | null;
  status: string;
  is_public: number | string;
  visibility: string | null;
  category_id: number | null;
  discussion_thread_id: number | null;
  created_at: Date | string;
};

/** Keep old comments readable in the legacy table while copying them into forum Replies. */
export function legacyResourceCommentReplyStatus(status: string): 'published' | 'pending' | 'deleted' {
  if (status === 'visible') return 'published';
  if (status === 'deleted') return 'deleted';
  return 'pending';
}

function insertId(result: any): number {
  const value = Number(result?.insertId ?? result?.[0]?.insertId);
  if (!Number.isInteger(value) || value <= 0) throw new Error('Resource discussion migration did not receive an insert id');
  return value;
}

function isPublicResource(resource: ResourceDiscussionRow, categoryActive: boolean): boolean {
  return Number(resource.is_public) === 1
    && ['approved', 'published'].includes(resource.status)
    && (resource.visibility == null || resource.visibility === 'public')
    && (!resource.category_id || categoryActive);
}

function boundedTitle(value: string): string {
  const points = Array.from(value);
  return points.length > 255 ? points.slice(0, 255).join('') : value;
}

function serializeRichDocument(value: unknown): string | null {
  if (value == null) return null;
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return null; }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? JSON.stringify(parsed) : null;
}

export class UnifyResourceDiscussions1720000230000 implements MigrationInterface {
  name = 'UnifyResourceDiscussions1720000230000';
  /** MySQL commits DDL implicitly; row-copy work below is wrapped in its own DML transaction. */
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    const [commentsExist, resourcesExist, postsExist, repliesExist] = await Promise.all([
      tableExists(queryRunner, 'resource_comments'),
      tableExists(queryRunner, 'resources'),
      tableExists(queryRunner, 'posts'),
      tableExists(queryRunner, 'replies'),
    ]);
    if (!commentsExist || !resourcesExist || !postsExist || !repliesExist) return;

    // Shared forum visibility checks resolve a discussion thread back to its
    // resource on every list/search query, so keep that lookup indexed.
    await createIndexIfMissing(queryRunner, 'resources', 'idx_resources_discussion_thread_id', ['discussion_thread_id']);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS resource_comment_reply_map (
        legacy_comment_id INT NOT NULL,
        reply_id INT NOT NULL,
        resource_id INT NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (legacy_comment_id),
        UNIQUE KEY uq_resource_comment_reply_map_reply (reply_id),
        KEY idx_resource_comment_reply_map_resource (resource_id, legacy_comment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.startTransaction();
    try {
      let lastId = 0;
      const threadByResource = new Map<number, number>();
      for (;;) {
        const comments = await queryRunner.query(
          `SELECT rc.id, rc.resource_id, rc.user_id, rc.parent_id, rc.content, rc.content_html,
                  rc.status, rc.edited_at, rc.upvote_count, rc.created_at, rc.updated_at
             FROM resource_comments rc
             LEFT JOIN resource_comment_reply_map mapped ON mapped.legacy_comment_id = rc.id
            WHERE rc.id > ? AND mapped.legacy_comment_id IS NULL
            ORDER BY rc.id ASC LIMIT 250`,
          [lastId],
        ) as LegacyResourceComment[];
        if (!comments.length) break;

        for (const comment of comments) {
          let postId = threadByResource.get(Number(comment.resource_id));
          if (!postId) {
            postId = await this.getOrCreateThread(queryRunner, Number(comment.resource_id));
            threadByResource.set(Number(comment.resource_id), postId);
          }

          const replyResult = await queryRunner.query(
            `INSERT INTO replies (
               post_id, user_id, parent_reply_id, content, content_html, status, like_count,
               created_at, updated_at
             ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
            [
              postId,
              comment.user_id,
              comment.content,
              comment.content_html,
              legacyResourceCommentReplyStatus(comment.status),
              Number(comment.upvote_count || 0),
              comment.created_at,
              comment.edited_at || comment.updated_at || comment.created_at,
            ],
          );
          const replyId = insertId(replyResult);
          await queryRunner.query(
            `INSERT INTO resource_comment_reply_map (legacy_comment_id, reply_id, resource_id, created_at)
             VALUES (?, ?, ?, ?)`,
            [comment.id, replyId, comment.resource_id, comment.created_at],
          );
          lastId = Math.max(lastId, Number(comment.id));
        }
      }

      // Resolve parents only after every historical comment has a stable crosswalk.
      // Parent rows from a different resource are intentionally not connected.
      await queryRunner.query(`
        UPDATE replies child_reply
        INNER JOIN resource_comment_reply_map child_map ON child_map.reply_id = child_reply.id
        INNER JOIN resource_comments legacy_child ON legacy_child.id = child_map.legacy_comment_id
        INNER JOIN resource_comment_reply_map parent_map
          ON parent_map.legacy_comment_id = legacy_child.parent_id
         AND parent_map.resource_id = child_map.resource_id
        SET child_reply.parent_reply_id = parent_map.reply_id
        WHERE legacy_child.parent_id IS NOT NULL
          AND child_reply.parent_reply_id IS NULL
      `);

      await queryRunner.query(`
        UPDATE posts discussion
        INNER JOIN resources resource ON resource.discussion_thread_id = discussion.id
        INNER JOIN (
          SELECT mapped.resource_id, MAX(legacy.created_at) AS latest_comment_at
            FROM resource_comment_reply_map mapped
            INNER JOIN resource_comments legacy ON legacy.id = mapped.legacy_comment_id
           GROUP BY mapped.resource_id
        ) activity ON activity.resource_id = resource.id
        SET discussion.last_activity_at = GREATEST(discussion.created_at, activity.latest_comment_at)
      `);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  private async getOrCreateThread(queryRunner: QueryRunner, resourceId: number): Promise<number> {
    const rows = await queryRunner.query(
      `SELECT id, user_id, title, description, content, content_html, content_json,
              content_schema_version, content_text, content_language, status, is_public, visibility, category_id,
              discussion_thread_id, created_at
         FROM resources WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [resourceId],
    ) as ResourceDiscussionRow[];
    const resource = rows[0];
    if (!resource) throw new Error(`Resource ${resourceId} for a legacy comment no longer exists`);

    const categoryRows = resource.category_id
      ? await queryRunner.query('SELECT is_active FROM resource_categories WHERE id = ?', [resource.category_id])
      : [{ is_active: 1 }];
    const publicResource = isPublicResource(resource, Number(categoryRows[0]?.is_active) === 1);

    if (resource.discussion_thread_id) {
      const existing = await queryRunner.query(
        'SELECT id, post_type, source FROM posts WHERE id = ? AND deleted_at IS NULL',
        [resource.discussion_thread_id],
      );
      if (existing[0]?.post_type === 'resource_discussion' && existing[0]?.source === 'SYSTEM') {
        return Number(existing[0].id);
      }
    }

    const timestamp = resource.created_at || new Date();
    const title = boundedTitle(`Resource discussion: ${resource.title || `#${resourceId}`}`);
    const createdPost = await queryRunner.query(
      `INSERT INTO posts (
         user_id, post_type, source, title, content, content_html, content_json,
         content_schema_version, content_text, content_language, status, is_pinned,
         is_locked, view_count, like_count, last_activity_at, created_at, updated_at
       ) VALUES (?, 'resource_discussion', 'SYSTEM', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)`,
      [
        resource.user_id,
        title,
        resource.content || resource.description || '',
        resource.content_html || null,
        serializeRichDocument(resource.content_json),
        resource.content_schema_version || 2,
        resource.content_text || resource.content || resource.description || '',
        resource.content_language || 'unknown',
        publicResource ? 'published' : 'pending',
        timestamp,
        timestamp,
        timestamp,
      ],
    );
    const postId = insertId(createdPost);
    await queryRunner.query('UPDATE resources SET discussion_thread_id = ? WHERE id = ?', [postId, resourceId]);
    return postId;
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Keep the crosswalk, forum threads, and replies. New replies may have been added
    // since this migration, and deleting them would rewrite live discussion history.
    await dropIndexIfPresent(queryRunner, 'resources', 'idx_resources_discussion_thread_id');
  }
}
