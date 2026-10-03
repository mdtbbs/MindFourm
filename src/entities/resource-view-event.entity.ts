import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A privacy-reduced, deduplicated resource detail view. Raw visitor addresses are never stored. */
@Entity('resource_view_events')
@Index('idx_resource_view_events_resource_created', ['resource_id', 'created_at'])
@Index('idx_resource_view_events_visitor_created', ['visitor_hash', 'created_at'])
@Index('idx_resource_view_events_referrer_created', ['referrer_category', 'created_at'])
export class ResourceViewEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'int', unsigned: true })
  resource_id: number;

  /** SHA-256 pseudonym derived from the visitor cookie or IP + User-Agent fallback. */
  @Column({ type: 'char', length: 64 })
  visitor_hash: string;

  @Column({ type: 'int', unsigned: true, nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 32 })
  referrer_category: string;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;
}
