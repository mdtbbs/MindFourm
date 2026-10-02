import { MigrationInterface, QueryRunner } from 'typeorm';

/** Durable direct and invite Join Intents with bounded consume-result recovery. */
export class MultiplayerJoinIntentRecovery1720000180000 implements MigrationInterface {
  name = 'MultiplayerJoinIntentRecovery1720000180000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE multiplayer_join_intents (
        intent_hash CHAR(64) NOT NULL,
        session_id VARCHAR(48) NOT NULL,
        user_id INT NOT NULL,
        invite_id VARCHAR(48) NULL,
        allow_join_policy_bypass TINYINT(1) NOT NULL DEFAULT 0,
        issued_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_client_id VARCHAR(128) NULL,
        consumed_peer_id VARCHAR(48) NULL,
        consumed_at DATETIME NULL,
        recovery_expires_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (intent_hash),
        UNIQUE KEY uq_multiplayer_join_intents_invite (invite_id),
        KEY idx_multiplayer_join_intents_user_expiry (user_id, expires_at),
        KEY idx_multiplayer_join_intents_peer_recovery (consumed_peer_id, recovery_expires_at),
        CONSTRAINT fk_multiplayer_join_intent_session FOREIGN KEY (session_id) REFERENCES multiplayer_sessions(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_join_intent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_join_intent_invite FOREIGN KEY (invite_id) REFERENCES multiplayer_invites(id) ON DELETE CASCADE,
        CONSTRAINT fk_multiplayer_join_intent_peer FOREIGN KEY (consumed_peer_id) REFERENCES multiplayer_peers(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS multiplayer_join_intents');
  }
}
