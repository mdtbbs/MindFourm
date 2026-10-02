import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, columnExists, createIndexIfMissing, dropIndexIfPresent, indexExists, tableExists } from './migration-utils';

/** Durable delivery and idempotent consumption for approved multiplayer joins. */
export class MultiplayerJoinApprovalDurability1720000170000 implements MigrationInterface {
  name = 'MultiplayerJoinApprovalDurability1720000170000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'requester_client_id', "VARCHAR(128) NOT NULL DEFAULT 'forum_web'");
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'join_intent_hash', 'CHAR(64) NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'approved_at', 'DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'join_intent_expires_at', 'DATETIME NULL');
    // Pre-durability approved rows have neither a recoverable bearer hash nor expiry/client binding.
    // Expire only those rows so users can submit a fresh request; independent Redis Join Intents are untouched.
    await queryRunner.query(`
      UPDATE multiplayer_join_requests
      SET status = 'expired'
      WHERE status = 'approved'
        AND join_intent_hash IS NULL
        AND join_intent_expires_at IS NULL
    `);
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'consumed_peer_id', 'VARCHAR(48) NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'consumed_client_id', 'VARCHAR(128) NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'consumed_at', 'DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'recovery_expires_at', 'DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'realtime_acknowledged_at', 'DATETIME NULL');
    await addColumnIfMissing(queryRunner, 'multiplayer_join_requests', 'realtime_last_published_at', 'DATETIME NULL');
    if (await tableExists(queryRunner, 'multiplayer_join_requests')
      && await columnExists(queryRunner, 'multiplayer_join_requests', 'join_intent_hash')
      && !(await indexExists(queryRunner, 'multiplayer_join_requests', 'uq_multiplayer_join_requests_intent_hash'))) {
      await queryRunner.query('CREATE UNIQUE INDEX uq_multiplayer_join_requests_intent_hash ON multiplayer_join_requests (join_intent_hash)');
    }
    await createIndexIfMissing(queryRunner, 'multiplayer_join_requests', 'idx_multiplayer_join_requests_realtime_pending',
      ['requester_user_id', 'requester_client_id', 'status', 'realtime_acknowledged_at']);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await dropIndexIfPresent(queryRunner, 'multiplayer_join_requests', 'idx_multiplayer_join_requests_realtime_pending');
    await dropIndexIfPresent(queryRunner, 'multiplayer_join_requests', 'uq_multiplayer_join_requests_intent_hash');
    if (!(await tableExists(queryRunner, 'multiplayer_join_requests'))) return;
    for (const column of [
      'realtime_last_published_at', 'realtime_acknowledged_at', 'recovery_expires_at', 'consumed_at',
      'consumed_client_id', 'consumed_peer_id', 'join_intent_expires_at', 'approved_at', 'join_intent_hash', 'requester_client_id',
    ]) {
      if (await columnExists(queryRunner, 'multiplayer_join_requests', column)) {
        await queryRunner.query(`ALTER TABLE multiplayer_join_requests DROP COLUMN \`${column}\``);
      }
    }
  }
}
