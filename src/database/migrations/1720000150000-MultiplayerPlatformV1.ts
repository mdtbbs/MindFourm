import { MigrationInterface, QueryRunner } from 'typeorm';

/** Social privacy and the durable part of MDTBBS Multiplayer Platform v1. */
export class MultiplayerPlatformV11720000150000 implements MigrationInterface {
  name = 'MultiplayerPlatformV11720000150000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Collapse historical reciprocal rows before adding the undirected pair key.
    // If either row was accepted, keep the pair accepted; otherwise retain the first row.
    await queryRunner.query(`
      UPDATE friendships f
      INNER JOIN (
        SELECT LEAST(requester_id, addressee_id) AS pair_low,
               GREATEST(requester_id, addressee_id) AS pair_high
        FROM friendships WHERE status = 'accepted'
        GROUP BY LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)
      ) accepted_pairs
        ON LEAST(f.requester_id, f.addressee_id) = accepted_pairs.pair_low
       AND GREATEST(f.requester_id, f.addressee_id) = accepted_pairs.pair_high
      SET f.status = 'accepted'
    `);
    await queryRunner.query(`
      DELETE earlier_duplicate FROM friendships earlier_duplicate
      INNER JOIN friendships retained
        ON LEAST(earlier_duplicate.requester_id, earlier_duplicate.addressee_id) = LEAST(retained.requester_id, retained.addressee_id)
       AND GREATEST(earlier_duplicate.requester_id, earlier_duplicate.addressee_id) = GREATEST(retained.requester_id, retained.addressee_id)
       AND earlier_duplicate.id > retained.id
    `);
    // MySQL 5.7 cannot safely COPY/rebuild this table to add STORED generated
    // columns while its existing foreign keys are present (see MySQL bug #94816).
    // Virtual generated columns and their secondary index are supported by 5.7;
    // add each separately because virtual-column changes cannot be combined with
    // other ALTER operations in-place.
    await queryRunner.query(`
      ALTER TABLE friendships
        ADD COLUMN pair_low INT GENERATED ALWAYS AS (LEAST(requester_id, addressee_id)) VIRTUAL
    `);
    await queryRunner.query(`
      ALTER TABLE friendships
        ADD COLUMN pair_high INT GENERATED ALWAYS AS (GREATEST(requester_id, addressee_id)) VIRTUAL
    `);
    await queryRunner.query(`
      ALTER TABLE friendships
        ADD UNIQUE INDEX uq_friendships_undirected_pair (pair_low, pair_high)
    `);

    await queryRunner.query(`
      CREATE TABLE social_privacy_settings (
        user_id INT NOT NULL,
        presence_visibility ENUM('everyone','friends','nobody') NOT NULL DEFAULT 'friends',
        activity_visibility ENUM('everyone','friends','nobody') NOT NULL DEFAULT 'friends',
        allow_join ENUM('everyone','friends','nobody') NOT NULL DEFAULT 'friends',
        allow_join_request ENUM('everyone','friends','nobody') NOT NULL DEFAULT 'friends',
        allow_invites ENUM('everyone','friends','nobody') NOT NULL DEFAULT 'friends',
        show_last_seen TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id),
        CONSTRAINT fk_social_privacy_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE user_presence_preferences (
        user_id INT NOT NULL,
        status ENUM('online','idle','dnd','invisible') NOT NULL DEFAULT 'online',
        last_seen_at DATETIME NULL,
        default_multiplayer_client_id VARCHAR(128) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id),
        CONSTRAINT fk_presence_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE multiplayer_sessions (
        id VARCHAR(48) NOT NULL,
        owner_user_id INT NOT NULL,
        code_hash CHAR(64) NULL,
        visibility ENUM('private','friends','unlisted') NOT NULL DEFAULT 'private',
        join_policy ENUM('open','friends','request','invite_only') NOT NULL DEFAULT 'friends',
        game_id VARCHAR(128) NOT NULL,
        game_version VARCHAR(64) NULL,
        activity_name VARCHAR(160) NULL,
        max_players SMALLINT UNSIGNED NOT NULL DEFAULT 8,
        status ENUM('active','closing','closed') NOT NULL DEFAULT 'active',
        close_after DATETIME NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_multiplayer_sessions_code_hash (code_hash),
        KEY idx_multiplayer_sessions_owner_status (owner_user_id, status),
        KEY idx_multiplayer_sessions_expiry (expires_at, status),
        CONSTRAINT fk_multiplayer_session_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE multiplayer_peers (
        id VARCHAR(48) NOT NULL,
        session_id VARCHAR(48) NOT NULL,
        user_id INT NOT NULL,
        client_id VARCHAR(128) NOT NULL,
        role ENUM('owner','member') NOT NULL DEFAULT 'member',
        status ENUM('joining','active','disconnected','left','expired') NOT NULL DEFAULT 'joining',
        capabilities JSON NULL,
        joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_multiplayer_peers_session_user_status (session_id, user_id, status),
        KEY idx_multiplayer_peers_session_status (session_id, status),
        CONSTRAINT fk_multiplayer_peer_session FOREIGN KEY (session_id) REFERENCES multiplayer_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_peer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE multiplayer_peer_resume_tokens (
        id INT NOT NULL AUTO_INCREMENT,
        peer_id VARCHAR(48) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_multiplayer_resume_token_hash (token_hash),
        KEY idx_multiplayer_resume_peer_expiry (peer_id, expires_at),
        CONSTRAINT fk_multiplayer_resume_peer FOREIGN KEY (peer_id) REFERENCES multiplayer_peers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE multiplayer_invites (
        id VARCHAR(48) NOT NULL,
        session_id VARCHAR(48) NOT NULL,
        sender_user_id INT NOT NULL,
        target_user_id INT NOT NULL,
        status ENUM('pending','accepted','declined','revoked','expired') NOT NULL DEFAULT 'pending',
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_multiplayer_invite_target_status_expiry (target_user_id, status, expires_at),
        KEY idx_multiplayer_invite_session_status (session_id, status),
        CONSTRAINT fk_multiplayer_invite_session FOREIGN KEY (session_id) REFERENCES multiplayer_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_invite_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_invite_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE multiplayer_join_requests (
        id VARCHAR(48) NOT NULL,
        session_id VARCHAR(48) NOT NULL,
        requester_user_id INT NOT NULL,
        target_user_id INT NOT NULL,
        status ENUM('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_multiplayer_join_session_status_expiry (session_id, status, expires_at),
        KEY idx_multiplayer_join_target_status (target_user_id, status),
        CONSTRAINT fk_multiplayer_join_session FOREIGN KEY (session_id) REFERENCES multiplayer_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_join_requester FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_join_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE multiplayer_relay_allocations (
        id VARCHAR(48) NOT NULL,
        session_id VARCHAR(48) NOT NULL,
        peer_id VARCHAR(48) NOT NULL,
        agent_id VARCHAR(96) NOT NULL,
        status ENUM('active','connected','revoked','expired') NOT NULL DEFAULT 'active',
        connection_id VARCHAR(128) NULL,
        connected_at DATETIME NULL,
        pending_expires_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_multiplayer_relay_agent_connection (agent_id, connection_id),
        KEY idx_multiplayer_relay_session_status (session_id, status),
        KEY idx_multiplayer_relay_agent_status (agent_id, status),
        CONSTRAINT fk_multiplayer_relay_session FOREIGN KEY (session_id) REFERENCES multiplayer_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_relay_peer FOREIGN KEY (peer_id) REFERENCES multiplayer_peers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE multiplayer_audit_logs (
        id INT NOT NULL AUTO_INCREMENT,
        actor_user_id INT NULL,
        action VARCHAR(64) NOT NULL,
        target_type VARCHAR(32) NOT NULL,
        target_id VARCHAR(64) NOT NULL,
        details JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_multiplayer_audit_actor_created (actor_user_id, created_at),
        KEY idx_multiplayer_audit_target (target_type, target_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_audit_logs');
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_relay_allocations');
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_join_requests');
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_invites');
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_peer_resume_tokens');
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_peers');
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS user_presence_preferences');
    await queryRunner.query('DROP TABLE IF EXISTS social_privacy_settings');
    await queryRunner.query('ALTER TABLE friendships DROP INDEX uq_friendships_undirected_pair');
    await queryRunner.query('ALTER TABLE friendships DROP COLUMN pair_low');
    await queryRunner.query('ALTER TABLE friendships DROP COLUMN pair_high');
  }
}
