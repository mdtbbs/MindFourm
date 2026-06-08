import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('search_history')
@Index(['user_id', 'created_at'])
@Index(['query'])
export class SearchHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number | null;

  @Column({ length: 255 })
  query: string;

  @Column({ length: 20, default: 'global' })
  search_type: string; // 'post', 'user', 'global'

  @Column({ type: 'int', default: 0 })
  results_count: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
