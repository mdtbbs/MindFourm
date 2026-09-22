import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index, Unique } from 'typeorm';
import { Resource } from './resource.entity';
import { User } from './user.entity';

@Entity('resource_likes')
@Unique('uq_resource_likes_user_resource', ['user_id', 'resource_id'])
@Index('idx_resource_likes_user', ['user_id'])
@Index('idx_resource_likes_resource', ['resource_id'])
export class ResourceLike {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  resource_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;
}
