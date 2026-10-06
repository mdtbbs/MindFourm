import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('resource_direct_upload_sessions')
@Index('idx_resource_direct_upload_owner_expiry', ['user_id', 'expires_at'])
export class ResourceDirectUploadSession {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column()
  user_id: number;

  @Column()
  resource_version_id: number;

  @Column({ type: 'varchar', length: 50 })
  role: string;

  @Column({ type: 'varchar', length: 500 })
  filename: string;

  @Column({ type: 'bigint' })
  size_bytes: number;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'char', length: 64, nullable: true })
  sha256: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  object_public_id: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  resource_file_public_id: string | null;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
