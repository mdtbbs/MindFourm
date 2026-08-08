/**
 * Store Index - Export all Zustand stores
 *
 * Usage:
 * import { useUserStore, useNotificationStore } from '@/store';
 */

export { useUserStore, useAuth } from './user-store';
export { useNotificationStore, useUnreadCount, useNotifications } from './notification-store';
export { useAdminNotificationStore, useAdminUnreadCount } from './admin-notification-store';
export { useOnlineStore, useOnlineCount, useOnlineUsers, usePresence, usePresences } from './online-store';
export { useSettingsStore, useSetting, useSettings } from './settings-store';
export { useToastStore, useToast } from './toast-store';
export type { ToastType, ToastItem } from './toast-store';
export { useLikeStore, useLikes } from './like-store';
export { useReactionStore, useReactions } from './reaction-store';
