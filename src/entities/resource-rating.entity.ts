import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Resource } from './resource.entity';

@Entity('resource_ratings')
@Index('idx_resource_ratings_resource_user', ['resource_id', 'user_id'], { unique: true })
export class ResourceRating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_id: number;

  @Column()
  user_id: number;

  @Column({ type: 'tinyint' })
  rating: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Resource, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;
}
