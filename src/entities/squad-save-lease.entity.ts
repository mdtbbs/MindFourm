import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type SquadSaveLeaseStatus = 'active' | 'released' | 'expired';

/**
 * 单写租约：每个存档槽至多一行，`fencing_token` 单调递增。
 *
 * TTL 为 150 秒（90 秒心跳 + 60 秒宽限）；自然到期后任意活跃成员可接力，
 * 未到期时只有 owner/admin 能强制接管。
 */
@Entity('squad_save_leases')
@Index('idx_squad_save_leases_expiry', ['status', 'expires_at'])
export class SquadSaveLease {
  @PrimaryColumn({ type: 'char', length: 36 }) slot_id: string;
  @Column({ type: 'char', length: 36 }) lease_id: string;
  @Column({ type: 'int' }) holder_user_id: number;
  @Column({ type: 'varchar', length: 128 }) holder_client_id: string;
  @Column({ type: 'varchar', length: 48, nullable: true }) multiplayer_session_id: string | null;
  @Column({ type: 'bigint', unsigned: true, default: 1 }) fencing_token: string;
  /** 最近一次被接管前的持有者与 token，仅用于旧房主 conflict_rescue 授权。 */
  @Column({ type: 'int', nullable: true }) previous_holder_user_id: number | null;
  @Column({ type: 'bigint', unsigned: true, nullable: true }) previous_fencing_token: string | null;
  @Column({ type: 'enum', enum: ['active', 'released', 'expired'], default: 'active' }) status: SquadSaveLeaseStatus;
  @Column({ type: 'datetime' }) acquired_at: Date;
  @Column({ type: 'datetime' }) last_heartbeat_at: Date;
  @Column({ type: 'datetime' }) expires_at: Date;
}
