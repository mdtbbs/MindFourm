import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique, Index,
} from 'typeorm';
import { User } from './user.entity';

// Both directions are read on their own: "who have I blocked?" drives the
// management list and the content filter, while "who has blocked me?" gates private
// messages — and the latter cannot use the former's leading column.
@Index('idx_user_blocks_blocker', ['blocker_id'])
@Index('idx_user_blocks_blocked', ['blocked_id'])
// The "already blocked?" check in application code is a read-then-write race, so a
// double submit would store the pair twice and leave `unblock` deleting one row and
// reporting success while the other still filtered content.
@Unique('uq_user_blocks_blocker_blocked', ['blocker_id', 'blocked_id'])
@Entity('user_blocks')
export class UserBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  blocker_id: number;

  @Column()
  blocked_id: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocker_id' })
  blocker: User;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocked_id' })
  blocked: User;
}
