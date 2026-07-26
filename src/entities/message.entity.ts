import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { User } from './user.entity';
import { GroupChat } from './group-chat.entity';

// The inbox unread count filters (recipient_id, is_read) and orders by created_at;
// the conversation query walks both directions of a (sender, recipient) pair.
@Index('idx_messages_recipient_read_created', ['recipient_id', 'is_read', 'created_at'])
@Index('idx_messages_sender_recipient', ['sender_id', 'recipient_id'])
@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  sender_id: number;

  @Column({ nullable: true })
  recipient_id: number;

  @Column({ nullable: true })
  group_chat_id: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string;

  @Column({ default: 0 })
  is_read: number;

  @Column({ nullable: true })
  read_at: Date;

  @Column({ default: 0 })
  deleted_by_sender: number;

  @Column({ default: 0 })
  deleted_by_recipient: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @ManyToOne(() => GroupChat, { eager: false, nullable: true })
  @JoinColumn({ name: 'group_chat_id' })
  groupChat: GroupChat;
}
