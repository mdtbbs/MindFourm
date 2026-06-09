import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  JoinColumn,
} from 'typeorm';
import { Post } from './post.entity';
import { User } from './user.entity';

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

  @Column({ length: 50, default: 'active' })
  status: string;

  @Column({ default: 0 })
  like_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToOne(() => Post, { eager: false })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Reply, { eager: false, nullable: true })
  @JoinColumn({ name: 'parent_reply_id' })
  parentReply: Reply;
}
