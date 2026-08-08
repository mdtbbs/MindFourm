import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addColumnIfMissing,
  addUniqueIfMissing,
  createIndexIfMissing,
} from './migration-utils';

/**
 * Creates the forum-side QQ OAuth tables and user binding columns.
 *
 * NOTE: These tables/columns are removed by migration 18000 (RemoveForumQQAuth).
 * The two migrations exist as a historical pair: 17000 added QQ OAuth support,
 * then 18000 removed it when QQ login was moved to the external Auth service.
 *
 * MySQL 8 does not support `ADD COLUMN IF NOT EXISTS` or `CREATE INDEX IF NOT
 * EXISTS` (MariaDB-only syntax), so every DDL here uses information_schema
 * guards via migration-utils helpers.
 */
export class AddQQAuthTables1720000017000 implements MigrationInterface {
  name = 'AddQQAuthTables1720000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 user_devices 表 (MySQL 8 supports CREATE TABLE IF NOT EXISTS)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        uid BIGINT NOT NULL COMMENT '用户ID',
        remember_token VARCHAR(255) NOT NULL COMMENT '设备令牌',
        ip VARCHAR(45) NOT NULL COMMENT '登录IP',
        device_info TEXT COMMENT '设备信息JSON',
        device_name VARCHAR(255) COMMENT '设备名称',
        platform VARCHAR(50) COMMENT '平台（web/app/ios/android）',
        token_expire DATETIME NOT NULL COMMENT '令牌过期时间',
        last_active DATETIME NOT NULL COMMENT '最后活跃时间',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_uid (uid),
        INDEX idx_remember_token (remember_token),
        INDEX idx_token_expire (token_expire)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户设备表';
    `);

    // 2. 创建 login_log 表 (MySQL 8 supports CREATE TABLE IF NOT EXISTS)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS login_log (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL COMMENT '用户ID',
        login_type VARCHAR(50) NOT NULL COMMENT '登录类型（qq/password/oauth）',
        platform VARCHAR(50) COMMENT '平台',
        device_id VARCHAR(255) COMMENT '设备ID',
        ip VARCHAR(45) COMMENT '登录IP',
        user_agent TEXT COMMENT 'User-Agent',
        login_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_login_time (login_time),
        INDEX idx_login_type (login_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志表';
    `);

    // 3. 修改 users 表，添加 QQ 相关字段 (使用 migration-utils 守卫以兼容 MySQL 8)
    await addColumnIfMissing(queryRunner, 'users', 'qq_openid', "VARCHAR(100) COMMENT 'QQ OpenID'");
    await addColumnIfMissing(queryRunner, 'users', 'qq_unionid', "VARCHAR(100) COMMENT 'QQ UnionID'");
    await addColumnIfMissing(queryRunner, 'users', 'qq_nickname', "VARCHAR(100) COMMENT 'QQ昵称'");
    await addColumnIfMissing(queryRunner, 'users', 'qq_avatar', "VARCHAR(500) COMMENT 'QQ头像URL'");

    // 4. 添加唯一约束和索引 (使用 migration-utils 守卫以兼容 MySQL 8)
    await addUniqueIfMissing(queryRunner, 'users', 'uq_users_qq_openid', ['qq_openid']);
    await addUniqueIfMissing(queryRunner, 'users', 'uq_users_qq_unionid', ['qq_unionid']);
    await createIndexIfMissing(queryRunner, 'users', 'idx_qq_openid', ['qq_openid']);
    await createIndexIfMissing(queryRunner, 'users', 'idx_qq_unionid', ['qq_unionid']);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // MySQL 8 不支持 DROP COLUMN IF EXISTS，使用信息模式守卫
    const { indexExists, columnExists, tableExists } = await import('./migration-utils');

    if (await indexExists(queryRunner, 'users', 'idx_qq_openid')) {
      await queryRunner.query('DROP INDEX `idx_qq_openid` ON `users`');
    }
    if (await indexExists(queryRunner, 'users', 'idx_qq_unionid')) {
      await queryRunner.query('DROP INDEX `idx_qq_unionid` ON `users`');
    }

    for (const column of ['qq_openid', 'qq_unionid', 'qq_nickname', 'qq_avatar']) {
      if (await columnExists(queryRunner, 'users', column)) {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`${column}\``);
      }
    }

    if (await tableExists(queryRunner, 'login_log')) {
      await queryRunner.query('DROP TABLE `login_log`');
    }
    if (await tableExists(queryRunner, 'user_devices')) {
      await queryRunner.query('DROP TABLE `user_devices`');
    }
  }
}
