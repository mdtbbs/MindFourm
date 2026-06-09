import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Post } from './post.entity';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  post_id: number;

  @Column({ nullable: true })
  reply_id: number;

  @Column()
  user_id: number;

  @Column({ length: 255 })
  file_name: string;

  @Column({ length: 500 })
  file_path: string;

  @Column()
  file_size: number;

  @Column({ length: 100 })
  mime_type: string;

  @Column({ default: 0 })
  download_count: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Post, { eager: false, nullable: true })
  @JoinColumn({ name: 'post_id' })
  post: Post;
}
