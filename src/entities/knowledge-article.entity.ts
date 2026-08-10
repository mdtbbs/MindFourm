import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('knowledge_articles')
@Index('idx_knowledge_articles_slug', ['slug'])
export class KnowledgeArticle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  public_id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  content_markdown: string | null;

  @Column({ type: 'text', nullable: true })
  content_html: string | null;

  @Column({ length: 50, default: 'draft' })
  status: string; // draft | published | archived

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: true })
  is_public: boolean;

  @Column({ type: 'int', nullable: true })
  author_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  related_resource_id: number | null;

  @Column({ type: 'int', nullable: true })
  related_thread_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
