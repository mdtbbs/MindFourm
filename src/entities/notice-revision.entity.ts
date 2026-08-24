import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Notice } from './notice.entity';
import { User } from './user.entity';

@Index('idx_notice_revisions_notice_created', ['notice_id', 'created_at', 'id'])
@Entity('notice_revisions')
export class NoticeRevision {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  notice_id: number;

  @Column({ type: 'int', nullable: true })
  editor_id: number | null;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  content_markdown: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  excerpt: string | null;

  @Column({ type: 'varchar', length: 32 })
  notice_type: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  change_summary: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Notice, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notice_id' })
  notice: Notice;

  @ManyToOne(() => User, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'editor_id' })
  editor: User | null;
}
