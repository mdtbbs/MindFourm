import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  JoinColumn, Index,
} from 'typeorm';
import { Post } from './post.entity';
import { User } from './user.entity';

// Thread rendering and reply counts always filter on (post_id, deleted_at) and
// order by created_at; without the composite index that is a full table scan.
@Index('idx_replies_post_deleted_created', ['post_id', 'deleted_at', 'created_at'])
@Index('idx_replies_status', ['status'])
@Entity('replies')
export class Reply {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  post_id: number;

  @Column()
  user_id: number;

  @Column({ nullable: true })
  parent_reply_id: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string;

  // Shares POST_STATUS' vocabulary — see REPLY_STATUS in common/utils/constants.
  @Column({ length: 50, default: 'published' })
  status: string;

  @Column({ default: 0 })
  like_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToOne('Post', { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne('Reply', { eager: false, nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_reply_id' })
  parentReply: Reply;
}
