import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type SquadOwnershipTransferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

/** 两步队长（配额）转让：现任队长发起，目标成员接受后原子切换。 */
@Entity('squad_ownership_transfers')
@Index('idx_sot_squad_status', ['squad_id', 'status'])
export class SquadOwnershipTransfer {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) squad_id: string;
  @Column({ type: 'int' }) from_user_id: number;
  @Column({ type: 'int' }) to_user_id: number;
  @Column({ type: 'enum', enum: ['pending', 'accepted', 'declined', 'cancelled', 'expired'], default: 'pending' })
  status: SquadOwnershipTransferStatus;
  @Column({ type: 'datetime' }) expires_at: Date;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @Column({ type: 'datetime', nullable: true }) resolved_at: Date | null;
}
