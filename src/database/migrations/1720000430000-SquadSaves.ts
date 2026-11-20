import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, tableExists } from './migration-utils';

/**
 * 无服务器领域服：小队共享存档接力（Squad Saves）。
 *
 * 九张表覆盖小队、成员、两步队长转让、共享存档槽、单写租约、物理隔离的
 * 小队 blob、快照 / 文件清单与差量上传暂存。每个 CREATE TABLE 都用
 * `tableExists` 守卫：迁移在 `DataSource.initialize()` 期间执行，空库会先由
 * baseline 的 synchronize 路径按实体元数据建表，已有库则由这里补齐，两条
 * 路径必须收敛且不能因重复建表让进程启动失败。
 */
export class SquadSaves1720000430000 implements MigrationInterface {
  name = 'SquadSaves1720000430000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'squads'))) {
      await queryRunner.query(`CREATE TABLE squads (
        id CHAR(36) NOT NULL,
        name VARCHAR(80) NOT NULL,
        owner_user_id INT NOT NULL,
        max_members SMALLINT UNSIGNED NOT NULL DEFAULT 8,
        max_slots SMALLINT UNSIGNED NOT NULL DEFAULT 5,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_squads_owner (owner_user_id, deleted_at),
        CONSTRAINT fk_squads_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_members'))) {
      await queryRunner.query(`CREATE TABLE squad_members (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        squad_id CHAR(36) NOT NULL,
        user_id INT NOT NULL,
        role ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
        status ENUM('invited','active','left','kicked') NOT NULL DEFAULT 'invited',
        invited_by_user_id INT NULL,
        joined_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_squad_member (squad_id, user_id),
        KEY idx_squad_members_user_status (user_id, status),
        CONSTRAINT fk_squad_members_squad FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_ownership_transfers'))) {
      await queryRunner.query(`CREATE TABLE squad_ownership_transfers (
        id CHAR(36) NOT NULL,
        squad_id CHAR(36) NOT NULL,
        from_user_id INT NOT NULL,
        to_user_id INT NOT NULL,
        status ENUM('pending','accepted','declined','cancelled','expired') NOT NULL DEFAULT 'pending',
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_sot_squad_status (squad_id, status),
        CONSTRAINT fk_sot_squad FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_save_slots'))) {
      await queryRunner.query(`CREATE TABLE squad_save_slots (
        id CHAR(36) NOT NULL,
        squad_id CHAR(36) NOT NULL,
        name VARCHAR(100) NOT NULL,
        head_snapshot_id CHAR(36) NULL,
        active_session_id VARCHAR(48) NULL,
        lanlink_room_code VARCHAR(16) NULL,
        game_version VARCHAR(64) NULL,
        mods_json JSON NULL,
        created_by_user_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_squad_save_slots_squad (squad_id, deleted_at, updated_at),
        CONSTRAINT fk_squad_save_slots_squad FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_save_leases'))) {
      await queryRunner.query(`CREATE TABLE squad_save_leases (
        slot_id CHAR(36) NOT NULL,
        lease_id CHAR(36) NOT NULL,
        holder_user_id INT NOT NULL,
        holder_client_id VARCHAR(128) NOT NULL,
        multiplayer_session_id VARCHAR(48) NULL,
        fencing_token BIGINT UNSIGNED NOT NULL DEFAULT 1,
        previous_holder_user_id INT NULL,
        previous_fencing_token BIGINT UNSIGNED NULL,
        status ENUM('active','released','expired') NOT NULL DEFAULT 'active',
        acquired_at DATETIME NOT NULL,
        last_heartbeat_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        PRIMARY KEY (slot_id),
        KEY idx_squad_save_leases_expiry (status, expires_at),
        CONSTRAINT fk_squad_save_leases_slot FOREIGN KEY (slot_id) REFERENCES squad_save_slots(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_save_blobs'))) {
      await queryRunner.query(`CREATE TABLE squad_save_blobs (
        id CHAR(36) NOT NULL,
        squad_id CHAR(36) NOT NULL,
        billing_user_id INT NOT NULL,
        sha256 CHAR(64) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        storage_provider VARCHAR(32) NOT NULL,
        object_key VARCHAR(512) NOT NULL,
        ref_count INT UNSIGNED NOT NULL DEFAULT 0,
        gc_in_progress TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_referenced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        pending_delete_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_squad_blob_sha_size (squad_id, sha256, size_bytes),
        KEY idx_squad_blobs_billing (billing_user_id, ref_count),
        KEY idx_squad_blobs_gc (ref_count, pending_delete_at),
        KEY idx_squad_blobs_squad (squad_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_save_snapshots'))) {
      await queryRunner.query(`CREATE TABLE squad_save_snapshots (
        id CHAR(36) NOT NULL,
        slot_id CHAR(36) NOT NULL,
        squad_id CHAR(36) NOT NULL,
        revision INT UNSIGNED NOT NULL,
        parent_snapshot_id CHAR(36) NULL,
        uploader_user_id INT NOT NULL,
        fencing_token BIGINT UNSIGNED NOT NULL,
        branch_type ENUM('main','conflict') NOT NULL DEFAULT 'main',
        retention_tier ENUM('recent','daily','pinned','conflict') NOT NULL DEFAULT 'recent',
        format VARCHAR(32) NOT NULL DEFAULT 'manifest_v1',
        manifest_file_count INT UNSIGNED NOT NULL DEFAULT 0,
        sha256 CHAR(64) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        game_version VARCHAR(64) NULL,
        game_build INT UNSIGNED NULL,
        map_name VARCHAR(160) NULL,
        wave INT UNSIGNED NULL,
        playtime_seconds INT UNSIGNED NULL,
        mods_manifest_json JSON NULL,
        mods_manifest_hash CHAR(64) NULL,
        reason VARCHAR(32) NOT NULL DEFAULT 'autosave',
        pinned TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_squad_snapshots_slot_rev (slot_id, deleted_at, revision DESC),
        KEY idx_squad_snapshots_branch (slot_id, branch_type, created_at DESC),
        KEY idx_squad_snapshots_squad (squad_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_save_snapshot_files'))) {
      await queryRunner.query(`CREATE TABLE squad_save_snapshot_files (
        snapshot_id CHAR(36) NOT NULL,
        file_path VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        blob_id CHAR(36) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        sha256 CHAR(64) NOT NULL,
        PRIMARY KEY (snapshot_id, file_path),
        KEY idx_squad_save_snapshot_files_blob (blob_id),
        CONSTRAINT fk_ssf_snapshot FOREIGN KEY (snapshot_id) REFERENCES squad_save_snapshots(id) ON DELETE CASCADE,
        CONSTRAINT fk_ssf_blob FOREIGN KEY (blob_id) REFERENCES squad_save_blobs(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    if (!(await tableExists(queryRunner, 'squad_save_blob_uploads'))) {
      await queryRunner.query(`CREATE TABLE squad_save_blob_uploads (
        id CHAR(36) NOT NULL,
        squad_id CHAR(36) NOT NULL,
        billing_user_id INT NOT NULL,
        uploader_user_id INT NOT NULL,
        lease_id CHAR(36) NOT NULL,
        sha256 CHAR(64) NOT NULL,
        size_bytes BIGINT UNSIGNED NOT NULL,
        object_key VARCHAR(512) NOT NULL,
        status ENUM('pending','ready','committed','expired') NOT NULL DEFAULT 'pending',
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ssbu_billing_status (billing_user_id, status),
        KEY idx_ssbu_expiry (status, expires_at),
        KEY idx_ssbu_squad_hash (squad_id, sha256, size_bytes)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }

    // 兼容：若某个开发库在本分支早期版本已由 baseline 建出小队表，后续补的
    // 两列不会随 tableExists 守卫出现；这里的幂等 ALTER 让两条路径收敛。
    await addColumnIfMissing(queryRunner, 'squad_save_snapshots', 'mods_manifest_json', 'JSON NULL AFTER playtime_seconds');
    await addColumnIfMissing(queryRunner, 'squad_save_snapshots', 'mods_manifest_hash', 'CHAR(64) NULL AFTER mods_manifest_json');
    await addColumnIfMissing(queryRunner, 'squad_save_leases', 'previous_holder_user_id', 'INT NULL AFTER fencing_token');
    await addColumnIfMissing(queryRunner, 'squad_save_leases', 'previous_fencing_token', 'BIGINT UNSIGNED NULL AFTER previous_holder_user_id');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 子表先删，避免 RESTRICT / 外键顺序问题；软删除语义与配额数据不可逆，
    // 回滚前要求运维确认没有仍在使用的小队存档。
    const live = await queryRunner.query('SELECT COUNT(*) AS count FROM squads WHERE deleted_at IS NULL').catch(() => [{ count: 0 }]);
    if (Number((live as any[])?.[0]?.count || 0) > 0) {
      throw new Error('Cannot revert SquadSaves while active squads exist');
    }
    await queryRunner.query('DROP TABLE IF EXISTS squad_save_blob_uploads');
    await queryRunner.query('DROP TABLE IF EXISTS squad_save_snapshot_files');
    await queryRunner.query('DROP TABLE IF EXISTS squad_save_snapshots');
    await queryRunner.query('DROP TABLE IF EXISTS squad_save_blobs');
    await queryRunner.query('DROP TABLE IF EXISTS squad_save_leases');
    await queryRunner.query('DROP TABLE IF EXISTS squad_save_slots');
    await queryRunner.query('DROP TABLE IF EXISTS squad_ownership_transfers');
    await queryRunner.query('DROP TABLE IF EXISTS squad_members');
    await queryRunner.query('DROP TABLE IF EXISTS squads');
  }
}
