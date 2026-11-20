import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type SquadMemberRole = 'owner' | 'admin' | 'member';
export type SquadMemberStatus = 'invited' | 'active' | 'left' | 'kicked';

/** 小队成员关系；邀请先落 `invited`，接受后转 `active`。 */
@Entity('squad_members')
@Index('uq_squad_member', ['squad_id', 'user_id'], { unique: true })
@Index('idx_squad_members_user_status', ['user_id', 'status'])
export class SquadMember {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string;
  @Column({ type: 'char', length: 36 }) squad_id: string;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'enum', enum: ['owner', 'admin', 'member'], default: 'member' }) role: SquadMemberRole;
  @Column({ type: 'enum', enum: ['invited', 'active', 'left', 'kicked'], default: 'invited' }) status: SquadMemberStatus;
  @Column({ type: 'int', nullable: true }) invited_by_user_id: number | null;
  @Column({ type: 'datetime', nullable: true }) joined_at: Date | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
