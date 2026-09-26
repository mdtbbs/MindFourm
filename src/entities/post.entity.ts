import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Reply } from './reply.entity';
import { Bookmark } from './bookmark.entity';
import { Attachment } from './attachment.entity';
import { Notification } from './notification.entity';
import { PostLike } from './post-like.entity';
import { PostTag } from './post-tag.entity';
import { Group } from './group.entity';

export const POST_SOURCES = ['USER', 'SYSTEM', 'GITHUB_ISSUE', 'GITHUB_PR', 'RSS', 'IMPORT', 'API'] as const;
export type PostSource = typeof POST_SOURCES[number];

// The list endpoints all filter on (deleted_at IS NULL, status) and then order by
// (is_pinned, created_at); one composite index covers that whole clause instead of
// scanning the table and sorting in memory.
@Index('idx_posts_deleted_status_pinned_created', ['deleted_at', 'status', 'is_pinned', 'created_at'])
@Index('idx_posts_deleted_status_last_activity', ['deleted_at', 'status', 'last_activity_at'])
@Index('idx_posts_status', ['status'])
@Index('idx_posts_slug', ['slug'])
@Index('idx_posts_post_type', ['post_type'])
@Index('idx_posts_source_status_activity', ['source', 'status', 'last_activity_at'])
@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ nullable: true })
  category_id: number;

  @Column({ nullable: true })
  required_group_id: number;

  @Column({ length: 50, default: 'normal' })
  post_type: string;

  /**
   * Provenance is deliberately separate from `post_type`: a question, guide or
   * announcement can each be authored by a member or created by an integration.
   * Existing rows are backfilled as USER by the additive migration.
   */
  @Column({ length: 32, default: 'USER' })
  source: PostSource;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string;

  /** Canonical allowlisted ProseMirror source; nullable for legacy imports and staged backfill. */
  @Column({ type: 'json', nullable: true })
  // TypeORM's QueryDeepPartialEntity treats JSON records as embedded relations;
  // runtime validation belongs to the rich-text boundary utility instead.
  content_json: any;

  @Column({ type: 'text', nullable: true })
  content_text: string | null;

  @Column({ length: 100, nullable: true })
  slug: string;

  @Column({ length: 50, default: 'draft' })
  status: string;

  @Column({ length: 500, nullable: true })
  reject_reason: string;

  @Column({ default: 0 })
  is_pinned: number;

  /**
   * Closed to new replies.
   *
   * Deliberately not indexed: nothing ever filters a list on it, it is only read
   * alongside the post it belongs to.
   */
  @Column({ type: 'tinyint', default: 0 })
  is_locked: number;

  /**
   * The reply the author (or a moderator) marked as the accepted answer.
   *
   * `SET NULL` on delete rather than CASCADE — losing the chosen reply must unmark
   * the post, not delete it.
   */
  @Column({ type: 'int', nullable: true })
  best_reply_id: number | null;

  /**
   * When the title or body was last changed, or null if never edited.
   *
   * Distinct from `updated_at`, which any write touches — pinning, moving and
   * moderation all bump that, and none of them are edits the reader should be told
   * about.
   */
  @Column({ type: 'datetime', nullable: true })
  edited_at: Date | null;

  @Column({ default: 0 })
  view_count: number;

  @Column({ default: 0 })
  like_count: number;

  /**
   * The latest visible activity in this topic: its creation or its latest
   * published reply. Persisting it keeps discussion-list pagination indexable.
   */
  @Column({ type: 'datetime' })
  last_activity_at: Date;

  /** Private audit value; public responses expose only `location_label`. */
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  /** CDN-provided province/region label safe to show beside a post. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  location_label: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Category, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @ManyToOne(() => Group, { eager: false, nullable: true })
  @JoinColumn({ name: 'required_group_id' })
  requiredGroup: Group;

  @ManyToOne('Reply', { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'best_reply_id' })
  bestReply: Reply | null;

  @OneToMany('Reply', 'post')
  replies: Reply[];

  @OneToMany('Bookmark', 'post')
  bookmarks: Bookmark[];

  @OneToMany('Attachment', 'post')
  attachments: Attachment[];

  @OneToMany('Notification', 'post')
  notifications: Notification[];

  @OneToMany('PostLike', 'post')
  likes: PostLike[];

  @OneToMany('PostTag', 'post')
  postTags: PostTag[];
}
