import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Append-only server-side audit of every authenticated search attempt. */
@Entity('search_audits')
@Index(['user_id', 'created_at'])
@Index(['query', 'created_at'])
export class SearchAudit {
  @PrimaryGeneratedColumn()
  id: number;

  // Intentionally no cascading user FK: deleting a user must not erase this audit trail.
  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 100 })
  username_snapshot: string;

  @Column({ type: 'varchar', length: 255 })
  query: string;

  @Column({ type: 'varchar', length: 20, default: 'started' })
  status: 'started' | 'completed' | 'blocked' | 'failed';

  @Column({ type: 'varchar', length: 50, nullable: true })
  blocked_reason: string | null;

  @Column({ type: 'int', nullable: true })
  results_count: number | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @Column({ type: 'datetime', nullable: true })
  completed_at: Date | null;
}
