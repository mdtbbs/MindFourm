import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('resource_comments')
@Index(['resource_id'])
@Index(['user_id'])
@Index(['parent_id'])
export class ResourceComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_id: number;

  @Column()
  user_id: number;

  @Column({ type: 'int', nullable: true })
  parent_id: number | null;

  @Column('text')
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string | null;

  @Column({ default: 'visible' })
  status: string;

  @Column({ type: 'datetime', nullable: true })
  edited_at: Date | null;

  @Column({ default: 0 })
  upvote_count: number;

  @Column({ default: 0 })
  downvote_count: number;

  @Column({ default: 0 })
  report_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
