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

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ResourceCategory, { eager: false, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: ResourceCategory;
}
