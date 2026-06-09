/**
 * Online Store - Zustand state management for online users tracking
 *
 * Tracks currently online users for display in the UI
 */

import { create } from 'zustand';

interface OnlineUser {
  id: number;
  username: string | null;
  avatar_url: string | null;
}

interface OnlineState {
  onlineUsers: OnlineUser[];
  onlineCount: number;
  lastUpdated: string | null;

  // Actions
  setOnlineUsers: (users: OnlineUser[]) => void;
  addOnlineUser: (user: OnlineUser) => void;
  removeOnlineUser: (userId: number) => void;
  updateOnlineCount: (count: number) => void;
  clearOnlineUsers: () => void;
}

export const useOnlineStore = create<OnlineState>((set, get) => ({
  onlineUsers: [],
  onlineCount: 0,
  lastUpdated: null,

  setOnlineUsers: (users) => {
    set({
      onlineUsers: users,
      onlineCount: users.length,
      lastUpdated: new Date().toISOString(),
    });
  },

  addOnlineUser: (user) => {
    set((state) => {
      // Avoid duplicates
      const exists = state.onlineUsers.some((u) => u.id === user.id);
      if (exists) return state;

      return {
        onlineUsers: [user, ...state.onlineUsers],
        onlineCount: state.onlineCount + 1,
        lastUpdated: new Date().toISOString(),
      };
    });
  },

  removeOnlineUser: (userId) => {
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u.id !== userId),
      onlineCount: Math.max(0, state.onlineCount - 1),
      lastUpdated: new Date().toISOString(),
    }));
  },

  updateOnlineCount: (count) => {
    set({
      onlineCount: count,
      lastUpdated: new Date().toISOString(),
    });
  },

  clearOnlineUsers: () => {
    set({
      onlineUsers: [],
      onlineCount: 0,
      lastUpdated: null,
    });
  },
}));

// Export convenience hooks
export function useOnlineCount() {
  return useOnlineStore((state) => state.onlineCount);
}

export function useOnlineUsers() {
  return useOnlineStore((state) => state.onlineUsers);
}