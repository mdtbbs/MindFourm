import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';

// The "already bookmarked?" check in application code is a read-then-write race, so
// a double-submit could store the same bookmark twice; only the constraint prevents
// that.
@Unique('uq_bookmarks_user_post', ['user_id', 'post_id'])
@Entity('bookmarks')
export class Bookmark {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
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
