import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

export type UserPresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';

@Entity('user_presence_preferences')
export class UserPresencePreference {
  @PrimaryColumn()
  user_id: number;

  @Column({ type: 'enum', enum: ['online', 'idle', 'dnd', 'invisible'], default: 'online' })
  status: UserPresenceStatus;

  @Column({ type: 'datetime', nullable: true })
  last_seen_at: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  default_multiplayer_client_id: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
