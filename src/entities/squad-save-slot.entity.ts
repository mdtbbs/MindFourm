import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** 小队共享存档槽；`head_snapshot_id` 指向主链最新快照。 */
@Entity('squad_save_slots')
@Index('idx_squad_save_slots_squad', ['squad_id', 'deleted_at', 'updated_at'])
export class SquadSaveSlot {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) squad_id: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'char', length: 36, nullable: true }) head_snapshot_id: string | null;
  @Column({ type: 'varchar', length: 48, nullable: true }) active_session_id: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) lanlink_room_code: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) game_version: string | null;
  /** 存档依赖的 Mod 摘要，接力开房前用于唤起模块三同步。 */
  @Column({ type: 'json', nullable: true }) mods_json: unknown;
  @Column({ type: 'int' }) created_by_user_id: number;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
  @DeleteDateColumn({ type: 'datetime', nullable: true }) deleted_at: Date | null;
}
