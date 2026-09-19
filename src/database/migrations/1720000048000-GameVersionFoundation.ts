import { MigrationInterface, QueryRunner } from 'typeorm';
import { addColumnIfMissing, createIndexIfMissing } from './migration-utils';

/** Additive GameVersion canonical fields; legacy columns remain readable during cutover. */
export class GameVersionFoundation1720000048000 implements MigrationInterface {
  name = 'GameVersionFoundation1720000048000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await addColumnIfMissing(queryRunner, 'game_versions', 'build', 'VARCHAR(50) NULL');
    await addColumnIfMissing(queryRunner, 'game_versions', 'channel', 'VARCHAR(50) NULL');
    await addColumnIfMissing(queryRunner, 'game_versions', 'is_stable', 'TINYINT NOT NULL DEFAULT 0');
    await addColumnIfMissing(queryRunner, 'game_versions', 'is_latest', 'TINYINT NOT NULL DEFAULT 0');
    await queryRunner.query('UPDATE `game_versions` SET `build` = `version_value` WHERE `build` IS NULL');
    await queryRunner.query('UPDATE `game_versions` SET `channel` = `release_channel` WHERE `channel` IS NULL');
    await queryRunner.query("UPDATE `game_versions` SET `is_stable` = 1 WHERE `channel` = 'stable'");
    await createIndexIfMissing(queryRunner, 'game_versions', 'idx_game_versions_latest', ['is_latest', 'channel']);
  }

  async down(): Promise<void> { throw new Error('GameVersion foundation is additive; restore from backup to roll back.'); }
}
