import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { Post } from './post.entity';
import { User } from './user.entity';

/**
 * One snapshot of a post's title and body as they stood *before* an edit.
 *
 * Storing the old values rather than the new ones means the revision list plus the
 * post's current content is the complete history, with no duplicate row for the
 * present state — and no write at all for posts that are never edited.
 */
// The only read pattern is "this post's history, newest first", so one composite
// index covers both the filter and the ordering.
@Index('idx_post_revisions_post_created', ['post_id', 'created_at'])
@Entity('post_revisions')
export class PostRevision {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  post_id: number;

  /**
   * Who made the edit this snapshot precedes.
   *
   * Nullable with `SET NULL`: a deleted account must not take the edit history of
   * other people's posts with it, and moderators edit posts they do not own.
   */
  @Column({ type: 'int', nullable: true })
  editor_id: number | null;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  created_at: Date;

  // CASCADE: a revision is meaningless without the post it belongs to, and the
  // history of a hard-deleted post is not something anyone can act on.
  @ManyToOne(() => Post, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'editor_id' })
  editor: User | null;
}
