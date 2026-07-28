/**
 * Notification Store - Zustand state management for notifications
 *
 * Provides real-time notification state with SSE integration
 * Replaces notification-related React Context implementations
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Notification } from '@/types';
import { notificationApi } from '@/lib/api/client';
import { registerUserScopedReset } from './reset-registry';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  lastUpdated: string | null;

  // Actions
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchNotifications: (limit?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  clearNotifications: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      lastUpdated: null,

      setNotifications: (notifications) => {
        set((state) => ({
          notifications,
          unreadCount: state.unreadCount,
          lastUpdated: new Date().toISOString(),
        }));
      },

      addNotification: (notification) => {
        set((state) => {
          // Avoid duplicates
          const exists = state.notifications.some((n) => n.id === notification.id);
          if (exists) return state;

          const newNotifications = [notification, ...state.notifications].slice(0, 50); // Keep max 50

          return {
            notifications: newNotifications,
            unreadCount: notification.is_read ? state.unreadCount : state.unreadCount + 1,
            lastUpdated: new Date().toISOString(),
          };
        });
      },

      markAsRead: async (notificationId: number) => {
        try {
          await notificationApi.markAsRead(notificationId);

          set((state) => {
            const target = state.notifications.find((n) => n.id === notificationId);
            const targetWasUnread = Boolean(target && !target.is_read);

            return {
              notifications: state.notifications.map((n) =>
                n.id === notificationId ? { ...n, is_read: true } : n
              ),
              unreadCount: targetWasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
            };
          });
        } catch (error) {
          console.error('Failed to mark notification as read:', error);
        }
      },

      markAllAsRead: async () => {
        try {
          await notificationApi.markAllAsRead();

          set((state) => ({
            notifications: state.notifications.map((n) => ({
              ...n,
              is_read: true,
            })),
            unreadCount: 0,
          }));
        } catch (error) {
          console.error('Failed to mark all notifications as read:', error);
        }
      },

      fetchNotifications: async (limit = 20) => {
        set({ isLoading: true });
        try {
          const [response, unread] = await Promise.all([
            notificationApi.list({ page: 1, limit }),
            notificationApi.unreadCount(),
          ]);
          set({
            notifications: response.data || [],
            unreadCount: unread.count,
            isLoading: false,
            lastUpdated: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Failed to fetch notifications:', error);
          set({ isLoading: false });
        }
      },

      fetchUnreadCount: async () => {
        try {
          const result = await notificationApi.unreadCount();
          set({ unreadCount: result.count });
        } catch (error) {
          console.error('Failed to fetch unread count:', error);
        }
      },

      clearNotifications: () => {
        set({
          notifications: [],
          unreadCount: 0,
          lastUpdated: null,
        });
      },
    }),
    {
      name: 'notification-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist unreadCount for badge display
        unreadCount: state.unreadCount,
        lastUpdated: state.lastUpdated,
      }),
    }
  )
);

// The unread count is per-user and persisted to localStorage, so it must be dropped
// on logout — otherwise the next person signing in on this browser inherits the
// previous account's badge.
registerUserScopedReset(() => {
  useNotificationStore.getState().clearNotifications();
});

// Export convenience hooks
export function useUnreadCount() {
  return useNotificationStore((state) => state.unreadCount);
}

export function useNotifications() {
  return useNotificationStore((state) => state.notifications);
}