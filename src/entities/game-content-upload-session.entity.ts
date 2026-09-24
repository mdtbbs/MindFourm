import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type GameContentUploadStatus = 'uploaded' | 'processing' | 'completed' | 'failed' | 'expired';

@Entity('game_content_upload_sessions')
@Index('idx_game_content_upload_owner_status', ['user_id', 'status', 'created_at'])
@Index('idx_game_content_upload_expiry', ['status', 'expires_at'])
@Index('idx_game_content_upload_hash', ['actual_sha256'])
export class GameContentUploadSession {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'varchar', length: 16, default: 'map' }) resource_kind: 'map';
  @Column({ type: 'varchar', length: 255 }) filename: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) mime_type: string | null;
  @Column({ type: 'bigint', unsigned: true }) actual_size: string | number;
  @Column({ type: 'char', length: 64 }) expected_sha256: string;
  @Column({ type: 'char', length: 64 }) actual_sha256: string;
  @Column({ type: 'varchar', length: 500 }) storage_key: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) preview_key: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) parser_version: string | null;
  @Column({ type: 'json', nullable: true }) renderer_metadata: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 16, default: 'uploaded' }) status: GameContentUploadStatus;
  @Column({ type: 'int', nullable: true }) resource_id: number | null;
  @Column({ type: 'datetime' }) expires_at: Date;
  @Column({ type: 'datetime', nullable: true }) completed_at: Date | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
