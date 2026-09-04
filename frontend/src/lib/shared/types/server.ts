export type ServerStatusType = 'pending' | 'approved' | 'running' | 'stopped' | 'deleted';

export interface Server {
  id: number;
  name: string;
  owner_id: number;
  port: number;
  status: ServerStatusType;
  version: string;
  container_id?: string;
  cpu_limit?: number;
  memory_limit?: number;
  bandwidth_limit?: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
}

// Real-time server statistics
export interface ServerStats {
  server_id: number;
  cpu_usage: number;
  memory_usage: number;
  bandwidth_usage: number;
  player_count: number;
  status: ServerStatusType;
  timestamp?: number;
}

// Server template for quick setup
export interface ServerTemplate {
  id: number;
  name: string;
  description?: string;
  default_config: Record<string, unknown>;
  default_plugins?: string[];
  is_active: boolean;
}

// Server configuration options
export interface ServerConfig {
  server_id: number;
  gamemode: string;
  maps: string[];
  plugins: string[];
  difficulty: number;
  pvp_enabled: boolean;
  wave_mode: boolean;
  unit_cap: number;
  build_speed: number;
}