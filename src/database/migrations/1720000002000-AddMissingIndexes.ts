import { MigrationInterface, QueryRunner } from 'typeorm';
import { createIndexIfMissing, dropIndexIfPresent } from './migration-utils';

/**
 * Index the columns the hot query paths actually filter and sort on.
 *
 * The ~40 indexes the old `src/database/schema.sql` declared were never applied —
 * that file was SQLite DDL running against MySQL 8 — so production has only the
 * indexes entity metadata happened to produce, and list, moderation and
 * notification queries are full table scans. `session_audit` had none at all
 * despite growing unboundedly.
 *
 * Names match the `@Index` decorators on the entities so a database created by
 * synchronize and one migrated by this file end up with the same index objects.
 */
const INDEXES: Array<{ table: string; name: string; columns: string[] }> = [
  // The list query filters (deleted_at IS NULL, status) then orders by
  // (is_pinned, created_at) — one composite index covers the whole clause.
  { table: 'posts', name: 'idx_posts_deleted_status_pinned_created', columns: ['deleted_at', 'status', 'is_pinned', 'created_at'] },
  { table: 'posts', name: 'idx_posts_status', columns: ['status'] },
  { table: 'posts', name: 'idx_posts_slug', columns: ['slug'] },
  { table: 'posts', name: 'idx_posts_post_type', columns: ['post_type'] },
  { table: 'posts', name: 'idx_posts_server_id', columns: ['server_id'] },

  { table: 'replies', name: 'idx_replies_post_deleted_created', columns: ['post_id', 'deleted_at', 'created_at'] },
  { table: 'replies', name: 'idx_replies_status', columns: ['status'] },

  { table: 'notifications', name: 'idx_notifications_user_read_created', columns: ['user_id', 'is_read', 'created_at'] },

  { table: 'messages', name: 'idx_messages_recipient_read_created', columns: ['recipient_id', 'is_read', 'created_at'] },
  { table: 'messages', name: 'idx_messages_sender_recipient', columns: ['sender_id', 'recipient_id'] },

  { table: 'session_audit', name: 'idx_session_audit_session_token', columns: ['session_token'] },
  { table: 'session_audit', name: 'idx_session_audit_user_id', columns: ['user_id'] },
  { table: 'session_audit', name: 'idx_session_audit_created_at', columns: ['created_at'] },

  { table: 'bans', name: 'idx_bans_type_value_active', columns: ['ban_type', 'value', 'is_active'] },

  { table: 'operation_logs', name: 'idx_operation_logs_created_at', columns: ['created_at'] },
  { table: 'operation_logs', name: 'idx_operation_logs_action', columns: ['action'] },
  { table: 'operation_logs', name: 'idx_operation_logs_target', columns: ['target_type', 'target_id'] },

  { table: 'email_logs', name: 'idx_email_logs_user_id', columns: ['user_id'] },
  { table: 'email_logs', name: 'idx_email_logs_status', columns: ['status'] },
  { table: 'email_logs', name: 'idx_email_logs_sent_at', columns: ['sent_at'] },
];

export class AddMissingIndexes1720000002000 implements MigrationInterface {
  name = 'AddMissingIndexes1720000002000';

  /** MySQL commits index DDL implicitly, so a wrapping transaction buys nothing. */
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `002_add_email_preferences.sql` used `idx_email_logs_user` for the same
    // column; drop it so the two naming schemes do not leave a duplicate index.
    await dropIndexIfPresent(queryRunner, 'email_logs', 'idx_email_logs_user');

    for (const { table, name, columns } of INDEXES) {
      await createIndexIfMissing(queryRunner, table, name, columns);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, name } of INDEXES) {
      await dropIndexIfPresent(queryRunner, table, name);
    }
  }
}
