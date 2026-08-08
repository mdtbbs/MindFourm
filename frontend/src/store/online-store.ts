/**
 * Online Store - Zustand state management for online users tracking
 *
 * Tracks currently online users for display in the UI
 */

import { create } from 'zustand';
import type { PresenceData, PresenceStatus } from '@/lib/api/client';

interface OnlineUser {
  id: number;
  username: string | null;
  avatar_url: string | null;
}

interface OnlineState {
  onlineUsers: OnlineUser[];
  onlineCount: number;
  lastUpdated: string | null;
  /** Map of userId -> PresenceData for granular presence tracking */
  presences: Map<number, PresenceData>;

  // Actions
  setOnlineUsers: (users: OnlineUser[]) => void;
  addOnlineUser: (user: OnlineUser) => void;
  removeOnlineUser: (userId: number) => void;
  updateOnlineCount: (count: number) => void;
  clearOnlineUsers: () => void;
  setPresences: (presences: Record<string, PresenceData>) => void;
  setPresence: (userId: number, data: PresenceData) => void;
  removePresence: (userId: number) => void;
}

export const useOnlineStore = create<OnlineState>((set, get) => ({
  onlineUsers: [],
  onlineCount: 0,
  lastUpdated: null,
  presences: new Map(),

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

  setPresences: (presences) => {
    const newMap = new Map(get().presences);
    for (const [idStr, data] of Object.entries(presences)) {
      const id = parseInt(idStr, 10);
      if (!isNaN(id)) {
        newMap.set(id, data);
      }
    }
    set({ presences: newMap });
  },

  setPresence: (userId, data) => {
    const newMap = new Map(get().presences);
    newMap.set(userId, data);
    set({ presences: newMap });
  },

  removePresence: (userId) => {
    const newMap = new Map(get().presences);
    newMap.delete(userId);
    set({ presences: newMap });
  },
}));

// Export convenience hooks
export function useOnlineCount() {
  return useOnlineStore((state) => state.onlineCount);
}

export function useOnlineUsers() {
  return useOnlineStore((state) => state.onlineUsers);
}

/**
 * Hook to get a single user's presence status.
 * Returns 'offline' if no presence data exists.
 */
export function usePresence(userId: number): PresenceStatus {
  return useOnlineStore((state) => {
    const presence = state.presences.get(userId);
    return presence?.status || 'offline';
  });
}

/**
 * Hook to get multiple users' presence statuses.
 * Returns a Map of userId -> PresenceStatus.
 */
export function usePresences(userIds: number[]): Map<number, PresenceStatus> {
  return useOnlineStore((state) => {
    const result = new Map<number, PresenceStatus>();
    for (const id of userIds) {
      const presence = state.presences.get(id);
      result.set(id, presence?.status || 'offline');
    }
    return result;
  });
}