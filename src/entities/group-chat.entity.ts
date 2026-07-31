import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, OneToMany, Unique } from 'typeorm';
import { User } from './user.entity';
import { GroupChatMember } from './group-chat-member.entity';

@Entity('group_chats')
export class GroupChat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column()
  creator_id: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @OneToMany('GroupChatMember', 'groupChat')
  members: GroupChatMember[];
}
