import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

// BanGuard checks every request as a (ban_type, value, is_active) lookup.
@Index('idx_bans_type_value_active', ['ban_type', 'value', 'is_active'])
@Entity('bans')
export class Ban {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  ban_type: string;

  @Column({ length: 255 })
  value: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ default: 1 })
  is_active: number;

  @Column({ nullable: true })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
