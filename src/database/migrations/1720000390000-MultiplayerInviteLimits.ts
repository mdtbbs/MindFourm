import { MigrationInterface, QueryRunner } from 'typeorm';
import { createIndexIfMissing, dropIndexIfPresent } from './migration-utils';

const TABLE = 'multiplayer_invites';
const SENDER_INDEX = 'idx_multiplayer_invites_sender_status_expiry';
const SESSION_TARGET_INDEX = 'idx_multiplayer_invites_session_target_status_expiry';

/** Indexes supporting sender invite caps and idempotent session-target retries. */
export class MultiplayerInviteLimits1720000390000 implements MigrationInterface {
  name = 'MultiplayerInviteLimits1720000390000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await createIndexIfMissing(queryRunner, TABLE, SENDER_INDEX, ['sender_user_id', 'status', 'expires_at']);
    await createIndexIfMissing(queryRunner, TABLE, SESSION_TARGET_INDEX, ['session_id', 'target_user_id', 'status', 'expires_at']);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await dropIndexIfPresent(queryRunner, TABLE, SESSION_TARGET_INDEX);
    await dropIndexIfPresent(queryRunner, TABLE, SENDER_INDEX);
  }
}
