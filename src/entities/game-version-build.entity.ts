import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { GameVersion } from './game-version.entity';

@Entity('game_version_builds')
@Index('idx_game_version_builds_version', ['game_version_id'])
export class GameVersionBuild {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  game_version_id: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  platform_key: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  download_url: string | null;

  @Column({ type: 'int', nullable: true })
  size_bytes: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  hash_algorithm: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  content_hash: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => GameVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_version_id' })
  game_version: GameVersion;
}
