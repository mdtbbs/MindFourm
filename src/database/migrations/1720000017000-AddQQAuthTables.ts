import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQQAuthTables1720000017000 implements MigrationInterface {
  name = 'AddQQAuthTables1720000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 user_devices 表
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

    // 2. 创建 login_log 表
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

    // 3. 修改 users 表，添加 QQ 相关字段
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS qq_openid VARCHAR(100) UNIQUE COMMENT 'QQ OpenID',
      ADD COLUMN IF NOT EXISTS qq_unionid VARCHAR(100) UNIQUE COMMENT 'QQ UnionID',
      ADD COLUMN IF NOT EXISTS qq_nickname VARCHAR(100) COMMENT 'QQ昵称',
      ADD COLUMN IF NOT EXISTS qq_avatar VARCHAR(500) COMMENT 'QQ头像URL';
    `);

    // 4. 添加索引
    await queryRunner.query(`
      ALTER TABLE users
      ADD INDEX idx_qq_openid (qq_openid),
      ADD INDEX idx_qq_unionid (qq_unionid);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. 删除 users 表的 QQ 字段
    await queryRunner.query(`
      ALTER TABLE users
      DROP INDEX idx_qq_openid,
      DROP INDEX idx_qq_unionid,
      DROP COLUMN IF EXISTS qq_openid,
      DROP COLUMN IF EXISTS qq_unionid,
      DROP COLUMN IF EXISTS qq_nickname,
      DROP COLUMN IF EXISTS qq_avatar;
    `);

    // 2. 删除 login_log 表
    await queryRunner.query(`DROP TABLE IF EXISTS login_log;`);

    // 3. 删除 user_devices 表
    await queryRunner.query(`DROP TABLE IF EXISTS user_devices;`);
  }
}
