import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('media_assets')
@Index('idx_media_assets_type', ['media_type'])
export class MediaAsset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  public_id: string;

  @Column({ length: 50 })
  media_type: string; // cover_image | screenshot | preview | avatar | embed

  @Column({ type: 'varchar', length: 50, nullable: true })
  storage_backend: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  storage_key: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  original_filename: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mime_type: string | null;

  @Column({ type: 'int', nullable: true })
  size_bytes: number | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  hash_algorithm: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  content_hash: string | null;

  @Column({ length: 50, default: 'active' })
  status: string; // active | archived | deleted

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
