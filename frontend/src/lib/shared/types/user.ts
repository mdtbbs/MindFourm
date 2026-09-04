export type UserRole = 'guest' | 'user' | 'moderator' | 'admin';

export interface User {
  id: number;
  username: string | null;
  email: string | null;
  role: UserRole;
  avatar_url?: string | null;
  bio?: string | null;
  mindauth_id?: number;
  email_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

// User quota limits
export interface UserQuota {
  user_id: number;
  max_servers: number;
  total_cpu_limit: number;
  total_memory_limit: number;
  total_bandwidth_limit: number;
  role: UserRole;
}

// Extended user profile with statistics
export interface UserProfile extends User {
  post_count?: number;
  reply_count?: number;
  bookmark_count?: number;
  medals?: UserMedal[];
  titles?: UserTitle[];
}

// Medal awarded to users (for user profile display)
export interface UserMedal {
  id: number;
  name: string;
  description?: string;
  icon_url?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earned_at: string;
}

// Title displayed on user profiles
export interface UserTitle {
  id: number;
  name: string;
  color?: string;
  icon?: string;
  is_special: boolean;
}