import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { Group } from './group.entity';
import { User } from './user.entity';

@Entity('group_members')
@Unique(['group_id', 'user_id'])
export class GroupMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  group_id: number;

  @Column()
  user_id: number;

  @Column({ length: 20, default: 'member' })
  role: string;

  @CreateDateColumn()
  joined_at: Date;

  @ManyToOne(() => Group, { eager: false })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
