import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addColumnIfMissing, addUniqueIfMissing, columnExists, createIndexIfMissing, dropIndexIfPresent, tableExists,
} from './migration-utils';

/**
 * 模组房（模块三）：会话级 Mod 清单与同步计划。
 *
 * `multiplayer_sessions` 只保存计数与 Pack 版本引用，避免大厅列表为了展示模组数
 * 去连接子表；`multiplayer_session_mods` 保存建房时解析出的权威定级。资源身份
 * 列（`resource_*` / `file_public_id`）只在资源公开可见且版本已发布时写入，
 * 未过审、隔离、已删除、已合并或分类停用的目标不会留下任何可下载引用。
 *
 * 该迁移必须幂等：新库由基线迁移的实体同步建表，老库由这里补列；两条路径最终
 * 必须收敛到同一 schema。
 */
export class MultiplayerSessionMods1720000410000 implements MigrationInterface {
  name = 'MultiplayerSessionMods1720000410000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'multiplayer_sessions', 'mod_pack_version_id', 'INT NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_sessions', 'is_modded', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'multiplayer_sessions', 'mod_count', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'multiplayer_sessions', 'mod_syncable_count', 'SMALLINT UNSIGNED NOT NULL DEFAULT 0');
    await createIndexIfMissing(queryRunner, 'multiplayer_sessions', 'idx_multiplayer_sessions_mod_pack', ['mod_pack_version_id']);

    if (!(await tableExists(queryRunner, 'multiplayer_session_mods'))) {
      await queryRunner.query(`CREATE TABLE multiplayer_session_mods (
        id INT NOT NULL AUTO_INCREMENT,
        session_id VARCHAR(48) NOT NULL,
        mod_id VARCHAR(191) NOT NULL,
        display_name VARCHAR(255) NULL,
        version VARCHAR(100) NULL,
        sha256 CHAR(64) NULL,
        required TINYINT(1) NOT NULL DEFAULT 1,
        resolution_status ENUM('catalog_verified','catalog_version_mismatch','unlisted_local') NOT NULL DEFAULT 'unlisted_local',
        resource_id INT NULL,
        resource_public_id CHAR(36) NULL,
        resource_version_id INT NULL,
        resource_version_public_id CHAR(36) NULL,
        file_public_id CHAR(36) NULL,
        file_size_bytes BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_multiplayer_session_mods_session_mod (session_id, mod_id),
        KEY idx_multiplayer_session_mods_mod_session (mod_id, session_id),
        KEY idx_multiplayer_session_mods_resource_session (resource_id, session_id),
        CONSTRAINT fk_multiplayer_session_mods_session FOREIGN KEY (session_id)
          REFERENCES multiplayer_sessions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    await addUniqueIfMissing(queryRunner, 'multiplayer_session_mods', 'uq_multiplayer_session_mods_session_mod', ['session_id', 'mod_id']);
    await createIndexIfMissing(queryRunner, 'multiplayer_session_mods', 'idx_multiplayer_session_mods_mod_session', ['mod_id', 'session_id']);
    await createIndexIfMissing(queryRunner, 'multiplayer_session_mods', 'idx_multiplayer_session_mods_resource_session', ['resource_id', 'session_id']);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'multiplayer_session_mods')) {
      const rows = await queryRunner.query('SELECT COUNT(*) AS count FROM multiplayer_session_mods') as Array<{ count?: unknown }>;
      if (Number(rows?.[0]?.count || 0) > 0) {
        // 回滚会丢失房主上报的模组清单与同步定级；要求运营显式确认，而不是静默删数据。
        throw new Error('Cannot revert MultiplayerSessionMods while multiplayer_session_mods still has rows');
      }
    }
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_session_mods');
    await dropIndexIfPresent(queryRunner, 'multiplayer_sessions', 'idx_multiplayer_sessions_mod_pack');
    for (const column of ['mod_syncable_count', 'mod_count', 'is_modded', 'mod_pack_version_id']) {
      if (await columnExists(queryRunner, 'multiplayer_sessions', column)) {
        await queryRunner.query(`ALTER TABLE multiplayer_sessions DROP COLUMN \`${column}\``);
      }
    }
  }
}
