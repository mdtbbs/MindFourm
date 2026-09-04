/**
 * V1 Error Code Registry.
 *
 * Single source of truth for all error codes used in the V1 API.
 * Each code defines its HTTP status, retryability, and default message.
 *
 * Clients use the `code` field (not the message) for programmatic decisions.
 * Messages are human-readable and may be translated.
 */

export type V1ErrorCodeDefinition = {
  code: string;
  httpStatus: number;
  retryable: boolean;
  defaultMessage: string;
  description: string;
};

export const V1_ERROR_CODES: Record<string, V1ErrorCodeDefinition> = {
  // --- Authentication & Authorization ---
  AUTH_REQUIRED: {
    code: 'AUTH_REQUIRED',
    httpStatus: 401,
    retryable: false,
    defaultMessage: '需要身份认证',
    description: 'Request requires authentication but no valid session/token was provided.',
  },
  TOKEN_EXPIRED: {
    code: 'TOKEN_EXPIRED',
    httpStatus: 401,
    retryable: true,
    defaultMessage: '令牌已过期',
    description: 'The provided token has expired. Refresh and retry.',
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    httpStatus: 403,
    retryable: false,
    defaultMessage: '无权访问',
    description: 'Authenticated but lacks permission for this resource.',
  },

  // --- Resource ---
  RESOURCE_NOT_FOUND: {
    code: 'RESOURCE_NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    defaultMessage: '资源不存在或不可见',
    description: 'The requested resource does not exist or is not visible to the caller.',
  },
  RESOURCE_NOT_VISIBLE: {
    code: 'RESOURCE_NOT_VISIBLE',
    httpStatus: 403,
    retryable: false,
    defaultMessage: '资源不可见',
    description: 'The resource exists but is not visible (pending, rejected, disabled category, etc.).',
  },
  RESOURCE_VERSION_NOT_PUBLISHED: {
    code: 'RESOURCE_VERSION_NOT_PUBLISHED',
    httpStatus: 404,
    retryable: false,
    defaultMessage: '版本未发布',
    description: 'The requested version exists but is not in published state.',
  },
  RESOURCE_FILE_NOT_READY: {
    code: 'RESOURCE_FILE_NOT_READY',
    httpStatus: 409,
    retryable: true,
    defaultMessage: '资源文件暂不可用',
    description: 'The file is not yet ready for download (scanning, processing).',
  },
  RESOURCE_V1_DISABLED: {
    code: 'RESOURCE_V1_DISABLED',
    httpStatus: 403,
    retryable: false,
    defaultMessage: 'V1 资源接口暂未启用',
    description: 'The V1 resource read API is currently disabled via Settings flag.',
  },

  // --- Thread ---
  THREAD_NOT_FOUND: {
    code: 'THREAD_NOT_FOUND',
    httpStatus: 404,
    retryable: false,
    defaultMessage: '讨论不存在或不可见',
    description: 'The requested thread does not exist or is not visible.',
  },

  // --- Download ---
  DOWNLOAD_RATE_LIMITED: {
    code: 'DOWNLOAD_RATE_LIMITED',
    httpStatus: 429,
    retryable: true,
    defaultMessage: '下载请求过于频繁',
    description: 'Download requests are rate-limited. Retry after the indicated period.',
  },
  DELIVERY_TEMPORARILY_UNAVAILABLE: {
    code: 'DELIVERY_TEMPORARILY_UNAVAILABLE',
    httpStatus: 503,
    retryable: true,
    defaultMessage: '下载服务暂时不可用',
    description: 'The delivery backend is temporarily unavailable. Retry later.',
  },
  STORAGE_FAILURE: {
    code: 'STORAGE_FAILURE',
    httpStatus: 500,
    retryable: true,
    defaultMessage: '存储服务故障',
    description: 'An internal storage error occurred.',
  },
  HASH_UNAVAILABLE: {
    code: 'HASH_UNAVAILABLE',
    httpStatus: 503,
    retryable: true,
    defaultMessage: '文件哈希不可用',
    description: 'The file hash could not be computed or verified.',
  },

  // --- Client ---
  CLIENT_UPGRADE_REQUIRED: {
    code: 'CLIENT_UPGRADE_REQUIRED',
    httpStatus: 426,
    retryable: false,
    defaultMessage: '需要升级客户端',
    description: 'The client version is below the minimum supported. Upgrade required.',
  },

  // --- Generic ---
  VALIDATION_FAILED: {
    code: 'VALIDATION_FAILED',
    httpStatus: 400,
    retryable: false,
    defaultMessage: '请求参数验证失败',
    description: 'The request payload failed validation. Check the `details` array.',
  },
  HTTP_ERROR: {
    code: 'HTTP_ERROR',
    httpStatus: 0, // varies
    retryable: false,
    defaultMessage: 'HTTP 错误',
    description: 'Generic HTTP error. The actual status code is in the response.',
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    httpStatus: 500,
    retryable: true,
    defaultMessage: '服务器内部错误',
    description: 'An unexpected internal error occurred. Safe to retry.',
  },
};

/**
 * Look up an error code definition. Returns null for unknown codes.
 */
export function lookupV1ErrorCode(code: string): V1ErrorCodeDefinition | null {
  return V1_ERROR_CODES[code] ?? null;
}

/**
 * Get all registered error codes (for documentation/OpenAPI generation).
 */
export function getAllV1ErrorCodes(): V1ErrorCodeDefinition[] {
  return Object.values(V1_ERROR_CODES);
}
