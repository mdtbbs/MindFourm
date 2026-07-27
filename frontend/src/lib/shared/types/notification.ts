export type NotificationType = 'reply' | 'mention' | 'message' | 'system';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  actor_id: number;
  post_id?: number;
  reply_id?: number;
  message_id?: number;
  is_read: boolean;
  created_at: string;
}

export interface NotificationList {
  notifications: Notification[];
  unread_count: number;
  has_more: boolean;
}

export interface NotificationPreferences {
  user_id: number;
  email_notifications: boolean;
  push_notifications: boolean;
  reply_notifications: boolean;
  mention_notifications: boolean;
  message_notifications: boolean;
  system_notifications: boolean;
}