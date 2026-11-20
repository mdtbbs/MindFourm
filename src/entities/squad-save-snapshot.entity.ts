import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type SquadSaveBranchType = 'main' | 'conflict';
export type SquadSaveRetentionTier = 'recent' | 'daily' | 'pinned' | 'conflict';

/**
 * 小队共享存档快照（不可变）。
 *
 * `branch_type = 'conflict'` 的旧房主救援快照永不推进主链，也永不被
 * GFS 自动裁剪，保证强制接管后不丢档。
 */
@Entity('squad_save_snapshots')
@Index('idx_squad_snapshots_slot_rev', ['slot_id', 'deleted_at', 'revision'])
@Index('idx_squad_snapshots_branch', ['slot_id', 'branch_type', 'created_at'])
export class SquadSaveSnapshot {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) slot_id: string;
  @Column({ type: 'char', length: 36 }) squad_id: string;
  @Column({ type: 'int', unsigned: true }) revision: number;
  @Column({ type: 'char', length: 36, nullable: true }) parent_snapshot_id: string | null;
  @Column({ type: 'int' }) uploader_user_id: number;
  @Column({ type: 'bigint', unsigned: true }) fencing_token: string;
  @Column({ type: 'enum', enum: ['main', 'conflict'], default: 'main' }) branch_type: SquadSaveBranchType;
  @Column({ type: 'enum', enum: ['recent', 'daily', 'pinned', 'conflict'], default: 'recent' }) retention_tier: SquadSaveRetentionTier;
  @Column({ type: 'varchar', length: 32, default: 'manifest_v1' }) format: string;
  @Column({ type: 'int', unsigned: true, default: 0 }) manifest_file_count: number;
  @Column({ type: 'char', length: 64 }) sha256: string;
  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) game_version: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) game_build: number | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) map_name: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) wave: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) playtime_seconds: number | null;
  /** 快照级 Mod 摘要；接力开房前与 `slot.mods_json` 一起用于模块三同步。 */
  @Column({ type: 'json', nullable: true }) mods_manifest_json: unknown;
  @Column({ type: 'char', length: 64, nullable: true }) mods_manifest_hash: string | null;
  @Column({ type: 'varchar', length: 32, default: 'autosave' }) reason: string;
  @Column({ type: 'boolean', default: false }) pinned: boolean;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @DeleteDateColumn({ type: 'datetime', nullable: true }) deleted_at: Date | null;
}
