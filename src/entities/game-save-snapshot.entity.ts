import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

@Entity('game_save_snapshots')
@Unique('uq_game_save_snapshot_slot_revision', ['slot_id', 'revision'])
@Index('idx_game_save_snapshot_slot_created', ['slot_id', 'created_at'])
@Index('idx_game_save_snapshot_slot_sha', ['slot_id', 'sha256'])
@Index('idx_game_save_snapshot_created', ['created_at'])
@Index('idx_game_save_snapshot_pinned', ['is_pinned'])
export class GameSaveSnapshot {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) slot_id: string;
  @Column({ type: 'int', unsigned: true }) revision: number;
  /** Whole-package blob for zip snapshots; null for manifest snapshots. */
  @Column({ type: 'char', length: 36, nullable: true }) blob_id: string | null;
  /** zip = immutable whole package; manifest = content-addressed file list. */
  @Column({ type: 'enum', enum: ['zip', 'manifest'], default: 'zip' }) format: 'zip' | 'manifest';
  /** For manifest snapshots: sha256 of the canonical manifest, not of a zip. */
  @Column({ type: 'char', length: 64 }) sha256: string;
  /** For manifest snapshots: logical total of all file sizes. */
  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;
  @Column({ type: 'int', unsigned: true, nullable: true }) manifest_file_count: number | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) game_version: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) game_build: number | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) map_name: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) wave: number | null;
  @Column({ type: 'bigint', unsigned: true, nullable: true }) playtime_seconds: string | null;
  @Column({ type: 'json', nullable: true }) mods_manifest_json: Array<Record<string, string | null>> | null;
  @Column({ type: 'char', length: 64, nullable: true }) mods_manifest_hash: string | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) created_by_client_id: string | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) device_id: string | null;
  @Column({ type: 'enum', enum: ['manual', 'before_launch', 'after_exit', 'periodic', 'restore', 'conflict', 'import'] }) reason: string;
  @Column({ type: 'char', length: 36, nullable: true }) base_snapshot_id: string | null;
  @Column({ type: 'boolean', default: false }) is_pinned: boolean;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @Column({ type: 'datetime', nullable: true }) deleted_at: Date | null;
}
