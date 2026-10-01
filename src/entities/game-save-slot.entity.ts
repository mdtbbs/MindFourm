import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('game_save_slots')
@Index('idx_game_save_slots_user', ['user_id'])
@Index('idx_game_save_slots_user_updated', ['user_id', 'updated_at'])
export class GameSaveSlot {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'char', length: 36, nullable: true }) current_snapshot_id: string | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
  @DeleteDateColumn({ type: 'datetime', nullable: true }) deleted_at: Date | null;
}
