import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type SquadSaveBlobUploadStatus = 'pending' | 'ready' | 'committed' | 'expired';

/** 小队差量文件暂存区；快照提交前只预留配额，不产生 blob 引用。 */
@Entity('squad_save_blob_uploads')
@Index('idx_ssbu_billing_status', ['billing_user_id', 'status'])
@Index('idx_ssbu_expiry', ['status', 'expires_at'])
@Index('idx_ssbu_squad_hash', ['squad_id', 'sha256', 'size_bytes'])
export class SquadSaveBlobUpload {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) squad_id: string;
  @Column({ type: 'int' }) billing_user_id: number;
  @Column({ type: 'int' }) uploader_user_id: number;
  @Column({ type: 'char', length: 36 }) lease_id: string;
  @Column({ type: 'char', length: 64 }) sha256: string;
  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;
  @Column({ type: 'varchar', length: 512 }) object_key: string;
  @Column({ type: 'enum', enum: ['pending', 'ready', 'committed', 'expired'], default: 'pending' })
  status: SquadSaveBlobUploadStatus;
  @Column({ type: 'datetime' }) expires_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
