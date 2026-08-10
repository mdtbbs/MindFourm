import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { KnowledgeArticle } from './knowledge-article.entity';

@Entity('knowledge_revisions')
@Index('idx_knowledge_revisions_article', ['article'])
export class KnowledgeRevision {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  article_id: number;

  @Column({ type: 'text', nullable: true })
  content_markdown: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  change_summary: string | null;

  @Column({ type: 'int', nullable: true })
  revised_by_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => KnowledgeArticle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: KnowledgeArticle;
}
