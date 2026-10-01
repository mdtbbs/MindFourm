import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('game_save_blobs')
@Unique('uq_game_save_blob_user_sha_size', ['user_id', 'sha256', 'size_bytes'])
@Index('idx_game_save_blobs_ref_gc', ['ref_count', 'pending_delete_at'])
export class GameSaveBlob {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'char', length: 64 }) sha256: string;
  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;
  @Column({ type: 'varchar', length: 32 }) storage_provider: string;
  @Column({ type: 'varchar', length: 512 }) object_key: string;
  @Column({ type: 'int', unsigned: true, default: 0 }) ref_count: number;
  @Column({ type: 'boolean', default: false }) gc_in_progress: boolean;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) last_referenced_at: Date;
  @Column({ type: 'datetime', nullable: true }) pending_delete_at: Date | null;
}
