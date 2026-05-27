const db = require('../database');
const { parseMarkdown } = require('../utils/markdown');
const { POST_STATUS } = require('../utils/constants');
const { encodeCursor, decodeCursor } = require('../utils/cursor');
const TagService = require('./tag.service');

class PostService {
  static async create({ user_id, title, content, category_id, tags, status = POST_STATUS.draft }) {
    const contentHtml = parseMarkdown(content);

    const result = await db.transaction(async (conn) => {
      const [r] = await conn.execute(`
        INSERT INTO posts (user_id, title, content, content_html, category_id, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [user_id, title, content, contentHtml, category_id, status]);

      const postId = r.insertId;

      if (tags && tags.length > 0) {
        await TagService.attachTags(postId, tags);
      }

      return postId;
    });

    return this.getById(result);
  }

  static async getById(id) {
    const post = await db.queryOne(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             u.mindauth_id as author_mindauth_id, u.role as author_role
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `, [id]);

    if (post) {
      post.tags = await TagService.getPostTags(post.id);
    }

    return post;
  }

  /**
   * 获取帖子详情（合并查询，优化性能）
   * 同时获取帖子信息、标签、回复统计
   * @param {number} id - 帖子ID
   * @returns {Promise<object|null>}
   */
  static async getPostDetail(id) {
    const post = await db.queryOne(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             u.mindauth_id as author_mindauth_id, u.role as author_role,
             (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.deleted_at IS NULL) as reply_count
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `, [id]);

    if (!post) return null;

    // 获取标签（单次查询）
    post.tags = await TagService.getPostTags(post.id);

    // 异步增加浏览计数（不阻塞响应）
    this.incrementViewCount(id).catch(() => {});

    return post;
  }

  static async getList({ page = 1, limit = 20, category_id, status = POST_STATUS.published, user_id, search }) {
    const offset = (page - 1) * limit;
    const whereClauses = ['p.deleted_at IS NULL'];
    const params = [];

    if (category_id) {
      whereClauses.push('p.category_id = ?');
      params.push(category_id);
    }

    if (status) {
      whereClauses.push('p.status = ?');
      params.push(status);
    }

    if (user_id) {
      whereClauses.push('p.user_id = ?');
      params.push(user_id);
    }

    if (search) {
      whereClauses.push('(p.title LIKE ? OR p.content LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = whereClauses.join(' AND ');

    const posts = await db.query(`
      SELECT p.*, c.name as category_name,
             u.mindauth_id as author_mindauth_id, u.role as author_role,
             (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.deleted_at IS NULL) as reply_count
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause}
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const countResult = await db.queryOne(`SELECT COUNT(*) as total FROM posts p WHERE ${whereClause}`, params);

    // Batch-fetch tags for all posts
    if (posts.length > 0) {
      const tagMap = await TagService.getPostTagsForMultiplePosts(posts.map(p => p.id));
      for (const post of posts) {
        post.tags = tagMap[post.id] || [];
      }
    }

    return {
      data: posts,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit)
      }
    };
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      fields.push('content_html = ?');
      values.push(updates.content);
      values.push(parseMarkdown(updates.content));
    }
    if (updates.category_id !== undefined) {
      fields.push('category_id = ?');
      values.push(updates.category_id);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.is_pinned !== undefined) {
      fields.push('is_pinned = ?');
      values.push(updates.is_pinned ? 1 : 0);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await db.transaction(async (conn) => {
      await conn.execute(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, values);

      if (updates.tags !== undefined) {
        await TagService.detachTags(id);
        if (updates.tags.length > 0) {
          await TagService.attachTags(id, updates.tags);
        }
      }
    });

    return this.getById(id);
  }

  static async softDelete(id) {
    await db.execute(`
      UPDATE posts SET status = ?, deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [POST_STATUS.deleted, id]);
  }

  static async incrementViewCount(id) {
    await db.execute('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [id]);
  }

  static async pin(id, isPinned) {
    await db.execute('UPDATE posts SET is_pinned = ? WHERE id = ?', [isPinned ? 1 : 0, id]);
    return this.getById(id);
  }

  static async move(id, categoryId) {
    await db.execute('UPDATE posts SET category_id = ? WHERE id = ?', [categoryId, id]);
    return this.getById(id);
  }

  static async getListCursor({ limit = 20, cursor, category_id, search }) {
    const whereClauses = ['p.deleted_at IS NULL', 'p.status = ?', 'p.is_pinned = 0'];
    const params = ['published'];

    if (category_id) {
      whereClauses.push('p.category_id = ?');
      params.push(category_id);
    }

    if (search) {
      whereClauses.push('(p.title LIKE ? OR p.content LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (cursor) {
      const [createdAt, id] = decodeCursor(cursor);
      whereClauses.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');
      params.push(createdAt, createdAt, parseInt(id));
    }

    const whereClause = whereClauses.join(' AND ');

    // Fetch limit + 1 to determine has_more
    const posts = await db.query(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             u.mindauth_id as author_mindauth_id, u.role as author_role,
             (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.deleted_at IS NULL) as reply_count
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ?
    `, [...params, limit + 1]);

    // Pinned posts always show first
    const pinned = await db.query(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
             u.mindauth_id as author_mindauth_id, u.role as author_role,
             (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.deleted_at IS NULL) as reply_count
      FROM posts p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.deleted_at IS NULL AND p.status = ? AND p.is_pinned = 1
      ORDER BY p.created_at DESC
    `, ['published']);

    // Batch-fetch tags
    const allPosts = [...pinned, ...posts];
    if (allPosts.length > 0) {
      const tagMap = await TagService.getPostTagsForMultiplePosts(allPosts.map(p => p.id));
      for (const post of allPosts) {
        post.tags = tagMap[post.id] || [];
      }
    }

    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();

    const nextCursor = posts.length > 0
      ? encodeCursor(posts[posts.length - 1].created_at, posts[posts.length - 1].id)
      : null;

    return { data: allPosts, next_cursor: nextCursor, has_more: hasMore };
  }
}

module.exports = PostService;