import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Post } from './post.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, unique: true })
  name: string;

  @Column({ length: 255, unique: true })
  slug: string;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: 1 })
  is_active: number;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Post, (post) => post.category)
  posts: Post[];
}
