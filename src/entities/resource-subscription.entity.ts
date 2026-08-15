import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index, Unique } from 'typeorm';
import { Resource } from './resource.entity';
import { User } from './user.entity';

@Entity('resource_subscriptions')
@Unique('uq_resource_subscriptions_user_resource', ['user_id', 'resource_id'])
@Index('idx_resource_subscriptions_user', ['user_id'])
@Index('idx_resource_subscriptions_resource', ['resource_id'])
export class ResourceSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  resource_id: number;

  @Column({ length: 50, default: 'all' })
  notification_level: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;
}
