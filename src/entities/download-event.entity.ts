import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('download_events')
@Index('idx_download_events_resource_created', ['resource_id', 'created_at'])
@Index('idx_download_events_file_created', ['file_id', 'created_at'])
@Index('idx_download_events_user_created', ['user_id', 'created_at'])
@Index('idx_download_events_type_created', ['event_type', 'created_at'])
@Index('uq_download_events_dedup_bucket', ['dedup_key', 'dedup_bucket'], { unique: true })
export class DownloadEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'varchar', length: 16 })
  event_type: 'requested' | 'granted' | 'started' | 'completed' | 'failed';

  @Column({ type: 'int', unsigned: true }) resource_id: number;
  @Column({ type: 'int', unsigned: true, nullable: true }) version_id: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) file_id: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) user_id: number | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) client_type: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) client_version: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) platform: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) backend: string | null;
  @Column({ type: 'char', length: 64, nullable: true }) dedup_key: string | null;
  @Column({ type: 'bigint', unsigned: true, nullable: true }) dedup_bucket: string | null;

  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
