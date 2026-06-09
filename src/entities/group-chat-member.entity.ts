import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique } from 'typeorm';
import { GroupChat } from './group-chat.entity';
import { User } from './user.entity';

@Entity('group_chat_members')
@Unique(['group_chat_id', 'user_id'])
export class GroupChatMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  group_chat_id: number;

  @Column()
  user_id: number;

  @Column({ length: 20, default: 'member' })
  role: string;

  @CreateDateColumn()
  joined_at: Date;

  @ManyToOne(() => GroupChat, { eager: false })
  @JoinColumn({ name: 'group_chat_id' })
  groupChat: GroupChat;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
