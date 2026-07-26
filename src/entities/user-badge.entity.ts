import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { User } from './user.entity';
import { Badge } from './badge.entity';

// A badge is held or not held; without the constraint a re-run of the granting
// logic awards it twice and the profile renders it twice.
@Unique('uq_user_badges_user_badge', ['user_id', 'badge_id'])
@Entity('user_badges')
export class UserBadge {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  badge_id: number;

  @Column({ nullable: true })
  granted_by: number;

  @CreateDateColumn()
  granted_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Badge, { eager: false })
  @JoinColumn({ name: 'badge_id' })
  badge: Badge;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'granted_by' })
  granter: User;
}
