import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Durable owner-bound quarantine record shared by the V1 and game-content upload facades. */
@Index('idx_resource_upload_drafts_owner_expiry', ['user_id', 'expires_at'])
@Index('idx_resource_upload_drafts_hash_expiry', ['content_hash', 'expires_at'])
@Entity('resource_upload_drafts')
export class ResourceUploadDraft {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column()
  user_id: number;

  @Column({ length: 50 })
  resource_kind: string;

  @Column({ length: 500 })
  file_path: string;

  @Column({ length: 255 })
  file_name: string;

  @Column({ type: 'bigint' })
  file_size: number;

  @Column({ length: 100 })
  mime_type: string;

  @Column({ type: 'char', length: 64 })
  content_hash: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  preview_key: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  preview_object_id: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  preview_binding_id: string | null;

  @Column({ type: 'json', nullable: true })
  metadata_json: any;

  @Column({ type: 'varchar', length: 100, nullable: true })
  parser_version: string | null;

  @Column({ type: 'json', nullable: true })
  draft_json: any;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
