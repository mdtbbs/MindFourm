import { Entity, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Reply } from './reply.entity';

/** Same shape and rationale as PostLike: the (user, reply) pair is the key. */
@Entity('reply_likes')
export class ReplyLike {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  reply_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Reply, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reply_id' })
  reply: Reply;
}
