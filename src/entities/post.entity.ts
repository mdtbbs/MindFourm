import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Reply } from './reply.entity';
import { Bookmark } from './bookmark.entity';
import { Attachment } from './attachment.entity';
import { Notification } from './notification.entity';
import { PostLike } from './post-like.entity';
import { PostTag } from './post-tag.entity';
import { Group } from './group.entity';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column({ nullable: true })
  category_id: number;

  @Column({ nullable: true })
  server_id: number;

  @Column({ nullable: true })
  required_group_id: number;

  @Column({ length: 50, default: 'normal' })
  post_type: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string;

  @Column({ length: 100, nullable: true })
  slug: string;

  @Column({ length: 50, default: 'draft' })
  status: string;

  @Column({ length: 500, nullable: true })
  reject_reason: string;

  @Column({ default: 0 })
  is_pinned: number;

  @Column({ default: 0 })
  view_count: number;

  @Column({ default: 0 })
  like_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Category, { eager: false, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @ManyToOne(() => Group, { eager: false, nullable: true })
  @JoinColumn({ name: 'required_group_id' })
  requiredGroup: Group;

  @OneToMany(() => Reply, (reply) => reply.post)
  replies: Reply[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.post)
  bookmarks: Bookmark[];

  @OneToMany(() => Attachment, (attachment) => attachment.post)
  attachments: Attachment[];

  @OneToMany(() => Notification, (notification) => notification.post)
  notifications: Notification[];

  @OneToMany(() => PostLike, (postLike) => postLike.post)
  likes: PostLike[];

  @OneToMany(() => PostTag, (postTag) => postTag.post)
  postTags: PostTag[];
}
