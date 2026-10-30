import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Staging session for a standalone blob upload.
 *
 * A `ready` row is a verified object on disk that no snapshot references yet;
 * creating a manifest snapshot promotes it into `game_save_blobs`. Rows that
 * never get promoted are expired and their objects deleted by maintenance.
 */
@Entity('game_save_blob_uploads')
@Index('idx_game_save_blob_uploads_owner_status', ['user_id', 'status', 'expires_at'])
@Index('idx_game_save_blob_uploads_hash', ['user_id', 'sha256', 'size_bytes'])
export class GameSaveBlobUpload {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'char', length: 64 }) sha256: string;
  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;
  @Column({ type: 'varchar', length: 512 }) object_key: string;
  @Column({ type: 'varchar', length: 32 }) storage_provider: string;
  @Column({ type: 'enum', enum: ['pending', 'ready', 'committed', 'expired', 'failed'], default: 'pending' })
  status: 'pending' | 'ready' | 'committed' | 'expired' | 'failed';
  @Column({ type: 'char', length: 36, nullable: true }) committed_blob_id: string | null;
  @Column({ type: 'varchar', length: 128, nullable: true }) created_by_client_id: string | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
  @Column({ type: 'datetime' }) expires_at: Date;
  @Column({ type: 'datetime', nullable: true }) object_deleted_at: Date | null;
}
