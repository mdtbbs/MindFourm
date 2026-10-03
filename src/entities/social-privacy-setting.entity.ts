import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

export type SocialVisibility = 'everyone' | 'friends' | 'nobody';

@Entity('social_privacy_settings')
export class SocialPrivacySetting {
  @PrimaryColumn()
  user_id: number;

  @Column({ type: 'enum', enum: ['everyone', 'friends', 'nobody'], default: 'friends' })
  presence_visibility: SocialVisibility;

  @Column({ type: 'enum', enum: ['everyone', 'friends', 'nobody'], default: 'friends' })
  activity_visibility: SocialVisibility;

  @Column({ type: 'enum', enum: ['everyone', 'friends', 'nobody'], default: 'friends' })
  allow_join: SocialVisibility;

  @Column({ type: 'enum', enum: ['everyone', 'friends', 'nobody'], default: 'friends' })
  allow_join_request: SocialVisibility;

  @Column({ type: 'enum', enum: ['everyone', 'friends', 'nobody'], default: 'friends' })
  allow_invites: SocialVisibility;

  @Column({ type: 'enum', enum: ['everyone', 'friends', 'nobody'], default: 'everyone' })
  allow_messages: SocialVisibility;

  @Column({ type: 'boolean', default: true })
  show_last_seen: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
