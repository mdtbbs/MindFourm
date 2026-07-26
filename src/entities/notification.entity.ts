import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';
import { Reply } from './reply.entity';

// The unread badge and the notification list are both (user_id, is_read) filters
// ordered by created_at, and they run on nearly every authenticated page view.
@Index('idx_notifications_user_read_created', ['user_id', 'is_read', 'created_at'])
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ length: 50 })
  type: string;

  @Column({ nullable: true })
  actor_id: number;

  @Column({ nullable: true })
  post_id: number;

  @Column({ nullable: true })
  reply_id: number;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ default: 0 })
  is_read: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'actor_id' })
  actor: User;

  // SET NULL, not CASCADE: the notification stays readable after the post or reply
  // it points at is removed, it just stops linking anywhere.
  @ManyToOne(() => Post, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => Reply, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reply_id' })
  reply: Reply;
}
