/**
 * LanLink 服务端 API 客户端。
 *
 * 直接调用 LanLink 控制面 API（非论坛后端），使用 JWT token 鉴权。
 * Token 存储在 localStorage，由用户在 LanLink 页面登录获取。
 */

const LANLINK_API = process.env.NEXT_PUBLIC_LANLINK_API_URL || 'https://ll.mdtbbs.cn';
const TOKEN_KEY = 'lanlink_token';
const USER_KEY = 'lanlink_user';

export interface LanLinkUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  role: string;
}

export interface LanLinkAuthResult {
  ok: boolean;
  token?: string;
  user?: LanLinkUser;
  message?: string;
}

export interface PublicRoom {
  code: string;
  name: string;
  display_name: string;
  public: boolean;
  owner: { type: string; id?: string; username?: string; display_name?: string; avatar_url?: string };
  node: { id: string; name: string; addr: string; room_port: number };
  direct?: { mode: string; addr: string; port: number };
  direct_candidates?: Array<{ mode: string; addr: string; port: number }>;
}

export interface FriendPresence {
  status: 'online' | 'hosting' | 'playing' | 'offline';
  room_code?: string;
  room_name?: string;
}

export interface LanLinkFriend {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  presence: FriendPresence;
}

export interface LanLinkInvite {
  from_user_id: string;
  from_username: string;
  from_display_name: string;
  room_code: string;
  room_name: string;
  node_name: string;
  created_at: number;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getLanLinkUser(): LanLinkUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isLanLinkLoggedIn(): boolean {
  return !!getToken() && !!getLanLinkUser();
}

export function logoutLanLink() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function lanlinkFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('login_required');

  const res = await fetch(`${LANLINK_API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts?.headers || {}),
    },
  });

  if (res.status === 401) {
    logoutLanLink();
    throw new Error('login_required');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `请求失败: ${res.status}`);
  }
  return res.json();
}

export const lanlinkClient = {
  /** 用户名密码登录，返回 token + 用户信息 */
  async login(username: string, password: string): Promise<LanLinkAuthResult> {
    const res = await fetch(`${LANLINK_API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data: LanLinkAuthResult = await res.json();
    if (data.ok && data.token && data.user) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return data;
  },

  /** 获取公开房间列表 */
  getPublicRooms(): Promise<{ rooms: PublicRoom[] }> {
    return lanlinkFetch('/api/rooms/public');
  },

  /** 获取好友列表（含 LanLink 状态） */
  getFriends(): Promise<{ ok: boolean; friends: LanLinkFriend[] }> {
    return lanlinkFetch('/api/friends');
  },

  /** 邀请好友到房间 */
  sendInvite(roomCode: string, friendUserId: string): Promise<{ ok: boolean }> {
    return lanlinkFetch('/api/invites/send', {
      method: 'POST',
      body: JSON.stringify({ room_code: roomCode, friend_user_id: friendUserId }),
    });
  },

  /** 响应联机邀请 */
  respondInvite(roomCode: string, action: 'accept' | 'decline'): Promise<{ ok: boolean }> {
    return lanlinkFetch('/api/invites/respond', {
      method: 'POST',
      body: JSON.stringify({ room_code: roomCode, action }),
    });
  },
};
