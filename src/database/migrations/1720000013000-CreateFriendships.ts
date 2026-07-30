import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  addForeignKeyIfMissing,
  addUniqueIfMissing,
  createIndexIfMissing,
  tableExists,
} from './migration-utils';

export class CreateFriendships1720000013000 implements MigrationInterface {
  name = 'CreateFriendships1720000013000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'friendships'))) {
      await queryRunner.query(`
        CREATE TABLE \`friendships\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`requester_id\` INT NOT NULL,
          \`addressee_id\` INT NOT NULL,
          \`status\` ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        )
      `);
    }

    await addUniqueIfMissing(
      queryRunner,
      'friendships',
      'uq_friendships_requester_addressee',
      ['requester_id', 'addressee_id'],
    );
    await createIndexIfMissing(queryRunner, 'friendships', 'idx_friendships_requester', ['requester_id']);
    await createIndexIfMissing(queryRunner, 'friendships', 'idx_friendships_addressee', ['addressee_id']);
    await createIndexIfMissing(queryRunner, 'friendships', 'idx_friendships_status', ['status']);

    await addForeignKeyIfMissing(
      queryRunner,
      'friendships',
      'fk_friendships_requester',
      'requester_id',
      'users',
      'id',
      'CASCADE',
    );
    await addForeignKeyIfMissing(
      queryRunner,
      'friendships',
      'fk_friendships_addressee',
      'addressee_id',
      'users',
      'id',
      'CASCADE',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `friendships`');
  }
}
