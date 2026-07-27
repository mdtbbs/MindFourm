import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique, Index,
} from 'typeorm';
import { User } from './user.entity';

export type ReactionTargetType = 'post' | 'reply';

// Every aggregate — the single-target summary and the batch `target_id IN (...)`
// version behind post lists — filters on exactly this pair.
@Index('idx_reactions_target', ['target_type', 'target_id'])
// One reaction per user per emoji per target. Toggle reads before it writes, so
// only the constraint stops a double-tap from inflating the count.
@Unique('uq_reactions_user_target_emoji', ['user_id', 'target_type', 'target_id', 'emoji'])
@Entity('reactions')
export class Reaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  // Polymorphic by design (posts and replies share the reaction UI), which is why
  // there is no foreign key on the target — existence is checked in the service.
  @Column({ type: 'varchar', length: 20 })
  target_type: ReactionTargetType;

  @Column()
  target_id: number;

  /**
   * Binary collation rather than the schema default: `utf8mb4_general_ci` assigns
   * every supplementary-plane character the same sort weight, so 👍 and 🎉 would
   * compare equal and the unique constraint above would permit only one emoji of
   * that plane per user per target.
   */
  @Column({ type: 'varchar', length: 32, charset: 'utf8mb4', collation: 'utf8mb4_bin' })
  emoji: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
