import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('game_save_idempotency')
@Unique('uq_game_save_idempotency_scope', ['user_id', 'operation', 'idempotency_key'])
@Index('idx_game_save_idempotency_expiry', ['expires_at'])
export class GameSaveIdempotency {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true }) id: number;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'varchar', length: 64 }) operation: string;
  @Column({ type: 'varchar', length: 128 }) idempotency_key: string;
  @Column({ type: 'char', length: 64 }) request_sha256: string;
  @Column({ type: 'longtext', nullable: true }) response_json: string | null;
  @Column({ type: 'datetime' }) expires_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
