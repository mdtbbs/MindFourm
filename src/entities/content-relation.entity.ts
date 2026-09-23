import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Typed link between a community content record and another domain object. */
@Index('uq_content_relation', ['source_type', 'source_id', 'target_type', 'target_id', 'relation_type'], { unique: true })
@Index('idx_content_relation_target', ['target_type', 'target_id', 'relation_type'])
@Index('idx_content_relation_source', ['source_type', 'source_id', 'relation_type'])
@Entity('content_relations')
export class ContentRelation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32 })
  source_type: string;

  @Column({ type: 'int' })
  source_id: number;

  @Column({ length: 64 })
  target_type: string;

  @Column({ type: 'varchar', length: 191 })
  target_id: string;

  @Column({ length: 32, default: 'related' })
  relation_type: string;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;
}
