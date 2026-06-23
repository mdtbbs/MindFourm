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

  @Column({ length: 500, nullable: true })
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

  @OneToMany(() => Post, (post) => post.user)
  posts: Post[];

  @OneToMany(() => Reply, (reply) => reply.user)
  replies: Reply[];

  @OneToMany(() => Bookmark, (bookmark) => bookmark.user)
  bookmarks: Bookmark[];

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  @OneToMany(() => Notification, (notification) => notification.actor)
  sentNotifications: Notification[];

  @OneToMany(() => Message, (message) => message.sender)
  sentMessages: Message[];

  @OneToMany(() => Message, (message) => message.recipient)
  receivedMessages: Message[];

  @OneToMany(() => Resource, (resource) => resource.user)
  resources: Resource[];

  @OneToMany(() => PostLike, (postLike) => postLike.user)
  postLikes: PostLike[];

  @OneToMany(() => ReplyLike, (replyLike) => replyLike.user)
  replyLikes: ReplyLike[];

  @OneToMany(() => Ban, (ban) => ban.creator)
  createdBans: Ban[];

  @OneToMany(() => OperationLog, (log) => log.user)
  operationLogs: OperationLog[];

  @OneToMany(() => PointLog, (pointLog) => pointLog.user)
  pointLogs: PointLog[];

  // Follow relationships
  @OneToMany(() => Follow, (follow) => follow.follower)
  following: Follow[];

  @OneToMany(() => Follow, (follow) => follow.following)
  followers: Follow[];

  // Badge relationships
  @OneToMany(() => UserBadge, (userBadge) => userBadge.user)
  userBadges: UserBadge[];

  @OneToMany(() => UserBadge, (userBadge) => userBadge.granter)
  grantedBadges: UserBadge[];

  // Group relationships
  @OneToMany(() => GroupMember, (member) => member.user)
  groupMemberships: GroupMember[];

  // Purchase relationships
  @OneToMany(() => Purchase, (purchase) => purchase.user)
  purchases: Purchase[];
}
