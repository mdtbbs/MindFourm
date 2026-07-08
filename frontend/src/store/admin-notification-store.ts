'use client';

import { create } from 'zustand';
import { adminNotificationApi } from '@/lib/api/client';
import { AdminNotification } from '@/types';

interface AdminNotificationState {
  notifications: AdminNotification[];
  unreadCount: number;
  isLoading: boolean;
  isConnected: boolean;
  lastEventAt: number;
  setConnected: (value: boolean) => void;
  setNotifications: (notifications: AdminNotification[]) => void;
  addNotification: (notification: AdminNotification) => void;
  fetchNotifications: (limit?: number) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useAdminNotificationStore = create<AdminNotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isConnected: false,
  lastEventAt: 0,

  setConnected: (value) => {
    set({ isConnected: value });
  },

  setNotifications: (notifications) => {
    set({
      notifications,
    });
  },

  addNotification: (notification) => {
    set((state) => {
      const exists = state.notifications.some((item) => item.id === notification.id);
      const notifications = exists
        ? state.notifications.map((item) => (item.id === notification.id ? notification : item))
        : [notification, ...state.notifications].slice(0, 10);
      const unreadCount = exists || notification.is_read
        ? state.unreadCount
        : state.unreadCount + 1;

      return {
        notifications,
        unreadCount,
        lastEventAt: Date.now(),
      };
    });
  },

  fetchNotifications: async (limit = 10) => {
    set({ isLoading: true });
    try {
      const response = await adminNotificationApi.list({ page: 1, limit });
      set({
        notifications: response.data,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    const response = await adminNotificationApi.unreadCount();
    set({ unreadCount: response.count });
  },

  markAsRead: async (notificationId) => {
    await adminNotificationApi.markAsRead(notificationId);
    set((state) => {
      const target = state.notifications.find((item) => item.id === notificationId);
      return {
        notifications: state.notifications.map((item) =>
          item.id === notificationId ? { ...item, is_read: true } : item
        ),
        unreadCount: Math.max(0, state.unreadCount - (target && !target.is_read ? 1 : 0)),
      };
    });
  },

  markAllAsRead: async () => {
    await adminNotificationApi.markAllAsRead();
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, is_read: true })),
      unreadCount: 0,
    }));
  },
}));

export function useAdminUnreadCount(): number {
  return useAdminNotificationStore((state) => state.unreadCount);
}
