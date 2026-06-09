import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import Redis from 'ioredis';

export interface TestActor {
  id: number;
  username: string;
  sessionToken: string;
}

export interface TestData {
  runId: string;
  user: TestActor;
  admin: TestActor;
  categoryId: number;
  publicPostId: number;
  publicResourceId: number;
  privateResourceId: number;
  pendingResourceId: number;
  staticResourceFileName: string;
  staticResourcePath: string;
  cleanup: () => Promise<void>;
}

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'mindforum_test',
  multipleStatements: false,
};

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB || 1),
};

const SESSION_TTL_SECONDS = 60 * 60;

function assertSafeTestDatabase(): void {
  if (process.env.E2E_ALLOW_NON_TEST_DB === 'true') return;
  if (!MYSQL_CONFIG.database.includes('_test')) {
    throw new Error(`拒绝在非测试库运行 E2E：${MYSQL_CONFIG.database}`);
  }
}

async function createUser(connection: mysql.Connection, runId: string, role: 'user' | 'admin', offset: number): Promise<Omit<TestActor, 'sessionToken'>> {
  const username = `e2e_${role}_${runId}`;
  const mindauthId = Number(`${runId.slice(-8)}${offset}`);
  const [result] = await connection.execute<mysql.ResultSetHeader>(
    'INSERT INTO users (mindauth_id, username, email, role, bio) VALUES (?, ?, ?, ?, ?)',
    [mindauthId, username, `${username}@example.test`, role, `Playwright ${role} user`]
  );
  return { id: result.insertId, username };
}

async function createSession(redis: Redis, userId: number): Promise<string> {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  await redis.hset(`session:${sessionToken}`, 'user_id', String(userId));
  await redis.expire(`session:${sessionToken}`, SESSION_TTL_SECONDS);
  return sessionToken;
}

export async function seedTestData(): Promise<TestData> {
  assertSafeTestDatabase();
  const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const connection = await mysql.createConnection(MYSQL_CONFIG);
  const redis = new Redis(REDIS_CONFIG);

  const categorySlug = `e2e-category-${runId}`;
  const tagSlug = `e2e-tag-${runId}`;
  const staticResourceFileName = `e2e-static-leak-${runId}.txt`;
  const staticResourcePath = path.join(process.cwd(), 'uploads', 'resources', staticResourceFileName);

  try {
    await connection.beginTransaction();

    const numericRunId = runId.replace(/\D/g, '').slice(-8).padStart(8, '0');
    const userBase = await createUser(connection, numericRunId, 'user', 1);
    userBase.username = `e2e_user_${runId}`;
    await connection.execute('UPDATE users SET username = ?, email = ? WHERE id = ?', [userBase.username, `${userBase.username}@example.test`, userBase.id]);
    const adminBase = await createUser(connection, numericRunId, 'admin', 2);
    adminBase.username = `e2e_admin_${runId}`;
    await connection.execute('UPDATE users SET username = ?, email = ? WHERE id = ?', [adminBase.username, `${adminBase.username}@example.test`, adminBase.id]);

    const [categoryResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO categories (name, slug, sort_order, is_active) VALUES (?, ?, ?, ?)',
      [`E2E 分类 ${runId}`, categorySlug, 1, 1]
    );
    const categoryId = categoryResult.insertId;

    const [tagResult] = await connection.execute<mysql.ResultSetHeader>(
      'INSERT INTO tags (name, slug) VALUES (?, ?)',
      [`E2E 标签 ${runId}`, tagSlug]
    );
    const tagId = tagResult.insertId;

    const [postResult] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO posts (user_id, category_id, title, content, content_html, status, post_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userBase.id,
        categoryId,
        `E2E 初始帖子 ${runId}`,
        `这是 Playwright 初始帖子 ${runId}`,
        `<p>这是 Playwright 初始帖子 ${runId}</p>`,
        'published',
        'normal',
      ]
    );
    const publicPostId = postResult.insertId;
    await connection.execute('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)', [publicPostId, tagId]);

    const [publicResourceResult] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO resources (user_id, title, description, resource_type, external_url, version, content, content_html, category_id, is_public, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userBase.id,
        `E2E Public Resource ${runId}`,
        '公开已审核资源',
        'external',
        'https://example.com/e2e-public',
        '1.0.0',
        '公开资源内容',
        '<p>公开资源内容</p>',
        null,
        1,
        'approved',
      ]
    );

    const [privateResourceResult] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO resources (user_id, title, description, resource_type, external_url, version, content, content_html, category_id, is_public, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userBase.id,
        `E2E Private Resource ${runId}`,
        '私有资源，游客不应可见',
        'external',
        'https://example.com/e2e-private',
        '1.0.0',
        '私有资源内容',
        '<p>私有资源内容</p>',
        null,
        0,
        'approved',
      ]
    );

    const [pendingResourceResult] = await connection.execute<mysql.ResultSetHeader>(
      `INSERT INTO resources (user_id, title, description, resource_type, external_url, version, content, content_html, category_id, is_public, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userBase.id,
        `E2E Pending Resource ${runId}`,
        '待审核资源，游客不应可见',
        'external',
        'https://example.com/e2e-pending',
        '1.0.0',
        '待审核资源内容',
        '<p>待审核资源内容</p>',
        null,
        1,
        'pending',
      ]
    );

    await connection.commit();

    const userSessionToken = await createSession(redis, userBase.id);
    const adminSessionToken = await createSession(redis, adminBase.id);

    await fs.mkdir(path.dirname(staticResourcePath), { recursive: true });
    await fs.writeFile(staticResourcePath, `E2E static resource leak probe ${runId}`, 'utf8');

    return {
      runId,
      user: { ...userBase, sessionToken: userSessionToken },
      admin: { ...adminBase, sessionToken: adminSessionToken },
      categoryId,
      publicPostId,
      publicResourceId: publicResourceResult.insertId,
      privateResourceId: privateResourceResult.insertId,
      pendingResourceId: pendingResourceResult.insertId,
      staticResourceFileName,
      staticResourcePath,
      cleanup: async () => {
        await cleanupTestData(runId, [userSessionToken, adminSessionToken], staticResourcePath);
      },
    };
  } catch (error) {
    await connection.rollback();
    await redis.quit();
    await connection.end();
    throw error;
  } finally {
    await redis.quit();
    await connection.end();
  }
}

export async function cleanupTestData(runId: string, sessionTokens: string[] = [], staticResourcePath?: string): Promise<void> {
  const connection = await mysql.createConnection(MYSQL_CONFIG);
  const redis = new Redis(REDIS_CONFIG);
  try {
    await connection.beginTransaction();
    const like = `%${runId}%`;

    await connection.execute('DELETE FROM bookmarks WHERE post_id IN (SELECT id FROM posts WHERE title LIKE ?)', [like]);
    await connection.execute('DELETE FROM notifications WHERE post_id IN (SELECT id FROM posts WHERE title LIKE ?)', [like]);
    await connection.execute('DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE username LIKE ?) OR recipient_id IN (SELECT id FROM users WHERE username LIKE ?)', [`e2e\_%\_${runId}`, `e2e\_%\_${runId}`]);
    await connection.execute('DELETE FROM attachments WHERE post_id IN (SELECT id FROM posts WHERE title LIKE ?)', [like]);
    await connection.execute('DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE title LIKE ?)', [like]);
    await connection.execute('DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE title LIKE ?)', [like]);
    await connection.execute('DELETE FROM posts WHERE title LIKE ?', [like]);
    await connection.execute('DELETE FROM resource_versions WHERE resource_id IN (SELECT id FROM resources WHERE title LIKE ?)', [like]);
    await connection.execute('DELETE FROM resources WHERE title LIKE ?', [like]);
    await connection.execute('DELETE FROM tags WHERE slug LIKE ?', [`e2e-tag-${runId}%`]);
    await connection.execute('DELETE FROM categories WHERE slug LIKE ?', [`e2e-category-${runId}%`]);
    await connection.execute('DELETE FROM users WHERE username LIKE ?', [`e2e\_%\_${runId}`]);
    await connection.commit();

    for (const token of sessionTokens) {
      await redis.del(`session:${token}`);
    }
    if (staticResourcePath) {
      await fs.rm(staticResourcePath, { force: true });
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await redis.quit();
    await connection.end();
  }
}
