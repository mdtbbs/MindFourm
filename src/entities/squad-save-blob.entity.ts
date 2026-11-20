import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * 小队内内容寻址 blob：`UNIQUE(squad_id, sha256, size_bytes)`。
 *
 * 它与 `game_save_blobs` 物理隔离，小队成员只能查询本表，无法借
 * `blobs/check` 探测创建者个人云存档中的文件哈希。
 */
@Entity('squad_save_blobs')
@Unique('uq_squad_blob_sha_size', ['squad_id', 'sha256', 'size_bytes'])
@Index('idx_squad_blobs_billing', ['billing_user_id', 'ref_count'])
@Index('idx_squad_blobs_gc', ['ref_count', 'pending_delete_at'])
export class SquadSaveBlob {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) squad_id: string;
  @Column({ type: 'int' }) billing_user_id: number;
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
