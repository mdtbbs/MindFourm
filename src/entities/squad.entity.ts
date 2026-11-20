import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * 小队（Squad）：共享存档空间的成员与配额归属容器。
 *
 * 配额始终记在 `owner_user_id` 名下；`squad_save_blobs.billing_user_id`
 * 必须与它保持一致，两步转让时在同一事务内一起切换。
 */
@Entity('squads')
@Index('idx_squads_owner', ['owner_user_id', 'deleted_at'])
export class Squad {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'varchar', length: 80 }) name: string;
  @Column({ type: 'int' }) owner_user_id: number;
  @Column({ type: 'smallint', unsigned: true, default: 8 }) max_members: number;
  @Column({ type: 'smallint', unsigned: true, default: 5 }) max_slots: number;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
  @DeleteDateColumn({ type: 'datetime', nullable: true }) deleted_at: Date | null;
}
