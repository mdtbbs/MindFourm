import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';
import { Reply } from './reply.entity';

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

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User;

  @ManyToOne(() => Post, { eager: false, nullable: true })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => Reply, { eager: false, nullable: true })
  @JoinColumn({ name: 'reply_id' })
  reply: Reply;
}
