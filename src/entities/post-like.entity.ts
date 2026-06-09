import { Entity, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';

@Entity('post_likes')
export class PostLike {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  post_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Post, { eager: false })
  @JoinColumn({ name: 'post_id' })
  post: Post;
}
