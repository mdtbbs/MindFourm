import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('map_version_metadata')
@Index('uq_map_version_metadata_version', ['resource_version_id'], { unique: true })
export class MapVersionMetadata {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 500, nullable: true }) preview_key: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) width: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) height: number | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) game_mode: string | null;
  @Column({ type: 'json', nullable: true }) game_modes_json: string[] | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) planet: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) player_count: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) playtime_seconds: number | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) game_version_min: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) game_version_max: string | null;
  @Column({ type: 'json', nullable: true }) rules_json: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) parser_version: string | null;
  @Column({ type: 'json', nullable: true }) source_renderer_metadata_json: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) source_metadata_json: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('map_resource_entries')
@Index('uq_map_resource_entries_identity', ['resource_version_id', 'resource_type', 'internal_name'], { unique: true })
export class MapResourceEntry {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 32 }) resource_type: string;
  @Column({ type: 'varchar', length: 191 }) internal_name: string;
  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true }) amount: number | null;
  @Column({ type: 'json', nullable: true }) distribution_json: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('map_spawns')
@Index('uq_map_spawns_identity', ['resource_version_id', 'spawn_type', 'team', 'x', 'y', 'wave'], { unique: true })
export class MapSpawn {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 32, default: 'player' }) spawn_type: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) team: string | null;
  @Column({ type: 'int', nullable: true }) x: number | null;
  @Column({ type: 'int', nullable: true }) y: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) wave: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('map_cores')
@Index('uq_map_cores_identity', ['resource_version_id', 'core_type', 'team', 'x', 'y'], { unique: true })
export class MapCore {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 32, nullable: true }) core_type: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) team: string | null;
  @Column({ type: 'int', nullable: true }) x: number | null;
  @Column({ type: 'int', nullable: true }) y: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('map_wave_summaries')
@Index('uq_map_wave_summaries_range', ['resource_version_id', 'wave_start', 'wave_end'], { unique: true })
@Index('idx_map_wave_summaries_boss', ['resource_version_id', 'boss_count'])
export class MapWaveSummary {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'int', unsigned: true }) wave_start: number;
  @Column({ type: 'int', unsigned: true }) wave_end: number;
  @Column({ type: 'int', unsigned: true, nullable: true }) enemy_count: number | null;
  @Column({ type: 'bigint', unsigned: true, nullable: true }) estimated_health: string | number | null;
  @Column({ type: 'decimal', precision: 6, scale: 3, nullable: true }) air_ratio: number | null;
  @Column({ type: 'int', unsigned: true, default: 0 }) boss_count: number;
  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: true }) strength: number | null;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) is_spike: number;
  @Column({ type: 'json', nullable: true }) details_json: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('map_analyses')
@Index('uq_map_analyses_version', ['resource_version_id'], { unique: true })
export class MapAnalysis {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) parser_version: string | null;
  @Column({ type: 'varchar', length: 24, default: 'completed' }) status: string;
  @Column({ type: 'varchar', length: 24, default: 'estimated' }) difficulty_confidence: string;
  @Column({ type: 'decimal', precision: 8, scale: 3, nullable: true }) estimated_difficulty: number | null;
  @Column({ type: 'json', nullable: true }) resource_balance_json: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) path_analysis_json: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) warnings_json: unknown[] | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('map_feedback')
@Index('uq_map_feedback_version_user', ['resource_version_id', 'user_id'], { unique: true })
@Index('idx_map_feedback_resource', ['resource_id', 'created_at'])
export class MapFeedback {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'tinyint', unsigned: true, nullable: true }) difficulty: number | null;
  @Column({ type: 'tinyint', unsigned: true, nullable: true }) resource_sufficiency: number | null;
  @Column({ type: 'tinyint', unsigned: true, nullable: true }) balance: number | null;
  @Column({ type: 'tinyint', unsigned: true, nullable: true }) multiplayer_experience: number | null;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
