import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import { Post } from './post.entity';
import { Reply } from './reply.entity';
import { User } from './user.entity';

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

  @ManyToOne(() => Post, { eager: false, nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  // `reply_id` and `user_id` held ids with no relation declared, so TypeORM emitted
  // neither a foreign key nor an index for either: attachments outlived the replies
  // they belonged to, and every lookup by uploader scanned the table.
  @ManyToOne(() => Reply, { eager: false, nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reply_id' })
  reply: Reply;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
