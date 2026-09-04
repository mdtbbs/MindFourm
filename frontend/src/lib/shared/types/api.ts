export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}

export interface CursorResponse<T> {
  success: boolean;
  data: T[];
  cursor?: string;
  has_more: boolean;
}

export interface ApiError {
  success: false;
  message: string;
  code?: string;
  status?: number;
}

// Common error codes
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE';

// Pagination parameters
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface CursorParams {
  cursor?: string;
  limit?: number;
}

// Sorting parameters
export interface SortParams {
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}