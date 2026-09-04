import {
  Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export const NOTICE_TYPES = ['system', 'maintenance', 'event', 'policy', 'release'] as const;
export type NoticeType = typeof NOTICE_TYPES[number];
export const NOTICE_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type NoticeStatus = typeof NOTICE_STATUSES[number];

@Index('uq_notices_public_id', ['public_id'], { unique: true })
@Index('uq_notices_slug', ['slug'], { unique: true })
@Index('idx_notices_public_feed', ['deleted_at', 'status', 'is_pinned', 'published_at', 'id'])
@Index('idx_notices_public_type_feed', ['deleted_at', 'status', 'notice_type', 'published_at', 'id'])
@Index('idx_notices_author_created', ['author_user_id', 'created_at'])
@Entity('notices')
export class Notice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36 })
  public_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  excerpt: string | null;

  @Column({ type: 'text' })
  content_markdown: string;

  @Column({ type: 'text', nullable: true })
  content_html: string | null;

  @Column({ type: 'varchar', length: 32, default: 'system' })
  notice_type: NoticeType;

  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status: NoticeStatus;

  @Column({ type: 'int', nullable: true })
  author_user_id: number | null;

  @Column({ type: 'tinyint', default: 0 })
  is_pinned: number;

  @Column({ type: 'datetime', nullable: true })
  pinned_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  published_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  edited_at: Date | null;

  @Column({ type: 'int', unsigned: true, default: 0 })
  view_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;

  @ManyToOne(() => User, { nullable: true, eager: false, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_user_id' })
  author: User | null;
}
