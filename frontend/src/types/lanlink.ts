// LanLink Quick Code Types

export interface QuickCodeStatus {
  has_code: boolean;
  created_at?: string;
  last_used_at?: string;
  use_count?: number;
}

export interface QuickCodeGenerateResponse {
  code: string;
  created_at: string;
}

export interface QuickCodeResetResponse {
  code: string;
  created_at: string;
}
