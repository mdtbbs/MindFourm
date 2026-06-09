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
        set({
          notifications,
          unreadCount: notifications.filter((n) => !n.is_read).length,
          lastUpdated: new Date().toISOString(),
        });
      },

      addNotification: (notification) => {
        set((state) => {
          // Avoid duplicates
          const exists = state.notifications.some((n) => n.id === notification.id);
          if (exists) return state;

          const newNotifications = [notification, ...state.notifications].slice(0, 50); // Keep max 50

          return {
            notifications: newNotifications,
            unreadCount: newNotifications.filter((n) => !n.is_read).length,
            lastUpdated: new Date().toISOString(),
          };
        });
      },

      markAsRead: async (notificationId: number) => {
        try {
          await notificationApi.markAsRead(notificationId);

          set((state) => ({
            notifications: state.notifications.map((n) =>
              n.id === notificationId ? { ...n, is_read: true } : n
            ),
            unreadCount: state.notifications.filter(
              (n) => n.id !== notificationId && !n.is_read
            ).length,
          }));
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
          const response = await notificationApi.list({ page: 1, limit });
          set({
            notifications: response.data || [],
            unreadCount: response.data?.filter((n) => !n.is_read).length || 0,
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

// Export convenience hooks
export function useUnreadCount() {
  return useNotificationStore((state) => state.unreadCount);
}

export function useNotifications() {
  return useNotificationStore((state) => state.notifications);
}