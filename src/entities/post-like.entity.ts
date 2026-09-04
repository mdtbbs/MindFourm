import { Entity, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';

/**
 * The pair *is* the identity — one like per user per post — so it is the primary
 * key. Databases built from the old DDL instead carried a surrogate `id` plus a
 * UNIQUE over the pair; UnifyLikeTables converts them, because identical code
 * against two different table shapes is how a bug reproduces in one environment
 * and not another.
 */
@Entity('post_likes')
export class PostLike {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  post_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Post, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;
}
