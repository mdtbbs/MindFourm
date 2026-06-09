import { Entity, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Reply } from './reply.entity';

@Entity('reply_likes')
export class ReplyLike {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  reply_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Reply, { eager: false })
  @JoinColumn({ name: 'reply_id' })
  reply: Reply;
}
