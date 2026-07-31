import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { Post } from './post.entity';
import { Reply } from './reply.entity';
import { Bookmark } from './bookmark.entity';
import { Notification } from './notification.entity';
import { Message } from './message.entity';
import { Resource } from './resource.entity';
import { PostLike } from './post-like.entity';
import { ReplyLike } from './reply-like.entity';
import { Ban } from './ban.entity';
import { OperationLog } from './operation-log.entity';
import { PointLog } from './point-log.entity';
import { Follow } from './follow.entity';
import { UserBadge } from './user-badge.entity';
import { GroupMember } from './group-member.entity';
import { Purchase } from './purchase.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  mindauth_id: number;

  @Column({ length: 255 })
  username: string;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 50, default: 'user' })
  role: string;

  @Column({ length: 500, nullable: true })
  avatar_url: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pending_avatar_url: string | null;

  @Column({ length: 30, default: 'approved' })
  avatar_status: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Column({ type: 'int', default: 0 })
  total_points: number;

  @Column({ type: 'int', default: 0 })
  available_points: number;

  // Email notification preferences
  @Column({ type: 'boolean', default: true })
  reply_email: boolean;

  @Column({ type: 'boolean', default: true })
  mention_email: boolean;

  @Column({ type: 'boolean', default: true })
  message_email: boolean;

  @Column({ type: 'boolean', default: true })
  system_email: boolean;

  @Column({ type: 'boolean', default: false })
  digest_email: boolean;

  @Column({ type: 'boolean', default: false })
  phone_verified: boolean;

  @Column({ type: 'datetime', nullable: true })
  phone_verified_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany('Post', 'user')
  posts: Post[];

  @OneToMany('Reply', 'user')
  replies: Reply[];

  @OneToMany('Bookmark', 'user')
  bookmarks: Bookmark[];

  @OneToMany('Notification', 'user')
  notifications: Notification[];

  @OneToMany('Notification', 'actor')
  sentNotifications: Notification[];

  @OneToMany('Message', 'sender')
  sentMessages: Message[];

  @OneToMany('Message', 'recipient')
  receivedMessages: Message[];

  @OneToMany('Resource', 'user')
  resources: Resource[];

  @OneToMany('PostLike', 'user')
  postLikes: PostLike[];

  @OneToMany('ReplyLike', 'user')
  replyLikes: ReplyLike[];

  @OneToMany('Ban', 'creator')
  createdBans: Ban[];

  @OneToMany('OperationLog', 'user')
  operationLogs: OperationLog[];

  @OneToMany('PointLog', 'user')
  pointLogs: PointLog[];

  // Follow relationships
  @OneToMany('Follow', 'follower')
  following: Follow[];

  @OneToMany('Follow', 'following')
  followers: Follow[];

  // Badge relationships
  @OneToMany('UserBadge', 'user')
  userBadges: UserBadge[];

  @OneToMany('UserBadge', 'granter')
  grantedBadges: UserBadge[];

  // Group relationships
  @OneToMany('GroupMember', 'user')
  groupMemberships: GroupMember[];

  // Purchase relationships
  @OneToMany('Purchase', 'user')
  purchases: Purchase[];
}
