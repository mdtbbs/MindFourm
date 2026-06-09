import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Badge } from './badge.entity';

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
