import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('friendships')
@Unique('uq_friendships_requester_addressee', ['requester_id', 'addressee_id'])
@Index('idx_friendships_requester', ['requester_id'])
@Index('idx_friendships_addressee', ['addressee_id'])
@Index('idx_friendships_status', ['status'])
export class Friendship {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'requester_id' })
  requester_id: number;

  @Column({ name: 'addressee_id' })
  addressee_id: number;

  @Column({ type: 'enum', enum: ['pending', 'accepted', 'rejected'], default: 'pending' })
  status: 'pending' | 'accepted' | 'rejected';

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addressee_id' })
  addressee: User;
}
