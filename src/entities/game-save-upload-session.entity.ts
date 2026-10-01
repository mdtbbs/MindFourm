import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('game_save_upload_sessions')
@Index('idx_game_save_upload_user', ['user_id'])
@Index('idx_game_save_upload_slot', ['slot_id'])
@Index('idx_game_save_upload_expiry', ['expires_at'])
@Index('idx_game_save_upload_status', ['status'])
export class GameSaveUploadSession {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'char', length: 36 }) slot_id: string;
  @Column({ type: 'char', length: 64 }) expected_sha256: string;
  @Column({ type: 'bigint', unsigned: true }) expected_size_bytes: string;
  @Column({ type: 'varchar', length: 32, nullable: true }) game_version: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) game_build: number | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) map_name: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) wave: number | null;
  @Column({ type: 'bigint', unsigned: true, nullable: true }) playtime_seconds: string | null;
  @Column({ type: 'json', nullable: true }) mods_manifest_json: Array<Record<string, string | null>> | null;
  @Column({ type: 'char', length: 64, nullable: true }) mods_manifest_hash: string | null;
  @Column({ type: 'char', length: 36, nullable: true }) base_snapshot_id: string | null;
  @Column({ type: 'enum', enum: ['manual', 'before_launch', 'after_exit', 'periodic', 'restore', 'conflict', 'import'] }) reason: string;
  @Column({ type: 'enum', enum: ['normal', 'create_conflict_copy', 'force_replace_head'], default: 'normal' }) conflict_resolution: string;
  @Column({ type: 'char', length: 36, nullable: true }) confirm_current_snapshot_id: string | null;
  @Column({ type: 'varchar', length: 512 }) object_key: string;
  @Column({ type: 'varchar', length: 32 }) storage_provider: string;
  @Column({ type: 'enum', enum: ['pending', 'uploaded', 'committed', 'expired', 'cancelled', 'failed'], default: 'pending' }) status: string;
  @Column({ type: 'varchar', length: 128, nullable: true }) created_by_client_id: string | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) device_id: string | null;
  @Column({ type: 'datetime' }) expires_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @Column({ type: 'datetime', nullable: true }) committed_at: Date | null;
  @Column({ type: 'char', length: 36, nullable: true }) committed_snapshot_id: string | null;
  @Column({ type: 'datetime', nullable: true }) object_deleted_at: Date | null;
}
