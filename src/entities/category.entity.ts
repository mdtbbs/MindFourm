import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, ManyToOne, JoinColumn,
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

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Hex colour used consistently by the forum sidebar, badges and headers. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  /** Restricted Lucide icon name selected in the category admin form. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string | null;

  /** Presentation group: community, creation, game or meta. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  group_key: string | null;

  @Column({ type: 'int', nullable: true })
  parent_id: number | null;

  @ManyToOne(() => Category, (category) => category.children, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @Column({ default: 1 })
  show_in_sidebar: number;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany('Post', 'category')
  posts: Post[];
}
