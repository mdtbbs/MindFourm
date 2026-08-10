import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('outbox_events')
@Index('idx_outbox_events_status', ['status'])
export class OutboxEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  event_key: string;

  @Column({ length: 50 })
  aggregate_type: string;

  @Column()
  aggregate_id: number;

  @Column({ type: 'json' })
  payload_json: any;

  @Column({ length: 50, default: 'pending' })
  status: string; // pending | processed | failed

  @Column({ default: 0 })
  retry_count: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'datetime', nullable: true })
  processed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
