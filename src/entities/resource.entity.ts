import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ResourceCategory } from './resource-category.entity';
import { ResourceVersion } from './resource-version.entity';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 50 })
  resource_type: string;

  @Column({ length: 255, nullable: true })
  file_name: string;

  @Column({ length: 500, nullable: true })
  file_path: string;

  @Column({ nullable: true })
  file_size: number;

  @Column({ length: 100, nullable: true })
  mime_type: string;

  @Column({ type: 'char', length: 64, nullable: true })
  content_hash: string | null;

  @Column({ length: 500, nullable: true })
  external_url: string;

  @Column({ default: 0 })
  use_mfl: number;

  @Column({ nullable: true })
  mfl_file_id: number;

  @Column({ length: 500, nullable: true })
  mfl_download_url: string;

  @Column({ length: 50, nullable: true })
  version: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string;

  @Column({ nullable: true })
  category_id: number;

  @Column({ default: 0 })
  is_public: number;

  @Column({ length: 100, nullable: true })
  slug: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reject_reason: string | null;

  @Column({ default: 0 })
  download_count: number;

  @Column({ default: 0 })
  rating_count: number;

  @Column({ default: 0 })
  rating_sum: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating_average: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // The `deleted_at` column already existed in the schema but was not declared
  // here, so nothing filtered on it and ResourcesService hard-deleted instead —
  // unlike posts and replies, which are soft-deletable.
  @DeleteDateColumn()
  deleted_at: Date;

  // --- V1 Resource aggregate fields (additive, all nullable) ---

  @Column({ type: 'char', length: 36, nullable: true, unique: true })
  public_id: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  resource_kind: string | null; // mod | map | schematic | save | server_plugin | development_tool | texture_ui | other

  @Column({ type: 'varchar', length: 50, nullable: true })
  visibility: string | null; // public | unlisted | private

  @Column({ type: 'varchar', length: 500, nullable: true })
  homepage_url: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  source_url: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  license: string | null;

  @Column({ type: 'int', nullable: true })
  latest_published_version_id: number | null;

  @Column({ type: 'int', nullable: true })
  discussion_thread_id: number | null;

  @Column({ type: 'json', nullable: true })
  metadata_json: any;

  @ManyToOne(() => ResourceVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'latest_published_version_id' })
  latest_published_version: ResourceVersion;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ResourceCategory, { eager: false, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: ResourceCategory;
}
