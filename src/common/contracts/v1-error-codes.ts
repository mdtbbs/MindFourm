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
  CHALLENGE_REQUIRED: {
    code: 'CHALLENGE_REQUIRED', httpStatus: 428, retryable: true,
    defaultMessage: '此操作需要完成一次安全验证。',
    description: 'A risk rule requires a short-lived, action-bound community challenge before retrying the operation.',
  },
  CHALLENGE_INVALID: {
    code: 'CHALLENGE_INVALID', httpStatus: 400, retryable: false,
    defaultMessage: '挑战验证未通过，请重新提交。',
    description: 'The submitted challenge response is invalid or belongs to another action.',
  },
  CHALLENGE_EXPIRED: {
    code: 'CHALLENGE_EXPIRED', httpStatus: 410, retryable: false,
    defaultMessage: '挑战已过期或已使用，请重新提交。',
    description: 'The challenge ticket expired or has already been consumed.',
  },
  CHALLENGE_PROVIDER_UNAVAILABLE: {
    code: 'CHALLENGE_PROVIDER_UNAVAILABLE', httpStatus: 503, retryable: true,
    defaultMessage: '挑战验证暂时不可用，请稍后重试。',
    description: 'The configured challenge provider could not complete server-side verification.',
  },
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
  RESOURCE_DUPLICATE: {
    code: 'RESOURCE_DUPLICATE',
    httpStatus: 409,
    retryable: false,
    defaultMessage: '这个文件已经提交过了',
    description: 'An active resource already has this exact file SHA-256 fingerprint.',
  },
  RESOURCE_STRUCTURE_DUPLICATE: {
    code: 'RESOURCE_STRUCTURE_DUPLICATE',
    httpStatus: 409,
    retryable: false,
    defaultMessage: '发现一个结构相同的蓝图，请说明用途或内容上的区别后继续提交',
    description: 'An exact schematic structure exists. A non-empty duplicate_note is required for final submission.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    code: 'IDEMPOTENCY_KEY_REUSED',
    httpStatus: 409,
    retryable: false,
    defaultMessage: 'Idempotency-Key 已用于另一份资源请求',
    description: 'The key is scoped to the account and is already bound to a different request payload.',
  },
  IDEMPOTENCY_IN_PROGRESS: {
    code: 'IDEMPOTENCY_IN_PROGRESS',
    httpStatus: 409,
    retryable: true,
    defaultMessage: '相同的资源请求仍在处理中，请稍后重试',
    description: 'The original request with this account-scoped idempotency key is still being processed.',
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

/** Stable codes used by Social Presence, Realtime, and Multiplayer V1 services. */
const SOCIAL_MULTIPLAYER_ERRORS: ReadonlyArray<readonly [string, number, boolean, string, string]> = [
  ['TOKEN_INVALID', 401, false, '令牌无效', 'The supplied access token is invalid.'],
  ['SCOPE_REQUIRED', 403, false, '授权权限不足', 'The OAuth token lacks a required scope.'],
  ['INSUFFICIENT_SCOPE', 403, false, '授权权限不足', 'The OAuth token lacks one or more required scopes.'],
  ['USER_BLOCKED', 403, false, '用户屏蔽了此联机操作', 'A block relationship prevents this social or multiplayer action.'],
  ['FRIEND_REQUIRED', 403, false, '需要先添加好友', 'The session policy requires an accepted friendship.'],
  ['PRIVACY_DENIED', 403, false, '对方的隐私设置不允许此操作', 'The target user privacy policy denies the operation.'],
  ['CLIENT_CAPABILITY_NOT_APPROVED', 403, false, '客户端能力尚未审核通过', 'The OAuth client has not received approval for this product capability.'],
  ['FEATURE_DISABLED', 403, false, '此功能暂未启用', 'The relevant site feature flag is disabled.'],
  ['PRESENCE_CONNECTION_NOT_FOUND', 404, false, 'Presence 连接不存在或不属于当前用户', 'The Presence connection is absent, expired, or belongs to another user.'],
  ['ACTIVITY_INVALID', 400, false, '活动数据无效', 'The submitted Rich Activity or Realtime protocol message is invalid.'],
  ['SESSION_NOT_FOUND', 404, false, '联机会话不存在', 'The requested Session does not exist.'],
  ['SESSION_EXPIRED', 404, false, '联机会话已过期', 'The requested Session has expired.'],
  ['SESSION_CLOSED', 404, false, '联机会话已关闭', 'The requested Session is closed.'],
  ['SESSION_FULL', 409, false, '联机会话人数已满', 'The Session has reached its player capacity.'],
  ['SESSION_NOT_JOINABLE', 400, false, '联机会话当前不可加入', 'The Session configuration does not allow this join path.'],
  ['SESSION_PERMISSION_DENIED', 403, false, '无权访问此联机会话', 'The caller cannot view or join this Session.'],
  ['PEER_NOT_FOUND', 404, false, '联机 Peer 不存在', 'The requested Peer does not exist in this Session.'],
  ['PEER_EXPIRED', 404, false, '联机 Peer 已过期', 'The Peer has left or expired.'],
  ['PEER_RESUME_INVALID', 403, false, 'Peer 恢复凭证无效', 'The one-time resume token is expired, consumed, or bound to another client.'],
  ['CANDIDATE_INVALID', 400, false, '连接候选数据无效', 'The Candidate payload or identifier is invalid.'],
  ['CANDIDATE_LIMIT_REACHED', 429, true, '连接候选数量已达上限', 'The per-Peer Candidate limit has been reached.'],
  ['INVITE_NOT_FOUND', 404, false, '联机邀请不存在', 'The invite does not exist or is not addressed to the caller.'],
  ['INVITE_EXPIRED', 410, false, '联机邀请已过期', 'The invite has expired.'],
  ['JOIN_REQUEST_REQUIRED', 409, false, '需要先请求房主批准加入', 'The Session requires an approved join request.'],
  ['JOIN_REQUEST_EXPIRED', 410, false, '加入请求不存在或已过期', 'The join request is missing or expired.'],
  ['JOIN_INTENT_INVALID', 403, false, '加入凭证不属于当前用户', 'The one-time Join Intent is bound to another user.'],
  ['JOIN_INTENT_EXPIRED', 410, false, '加入凭证已过期', 'The one-time Join Intent has expired.'],
  ['JOIN_INTENT_CONSUMED', 409, false, '加入凭证已使用', 'The one-time Join Intent was already consumed.'],
  ['RELAY_UNAVAILABLE', 503, true, '官方 Relay 暂不可用', 'No healthy official Relay Agent has capacity.'],
  ['RELAY_LIMIT_REACHED', 429, true, '官方 Relay 并发额度已满', 'The caller or Session has reached its Relay allocation limit.'],
  ['RATE_LIMITED', 429, true, '请求过于频繁', 'The request rate limit has been reached.'],
];

const CLOUD_SAVE_ERRORS: ReadonlyArray<readonly [string, number, boolean, string, string]> = [
  ['CLOUD_SAVES_DISABLED', 403, false, '云存档功能尚未启用', 'Cloud Saves is disabled for this deployment.'],
  ['SAVE_NOT_FOUND', 404, false, '云存档不存在', 'The Save Slot does not exist or is not owned by the caller.'],
  ['SAVE_SLOT_LIMIT_EXCEEDED', 409, false, '已达到云存档数量上限', 'The account has reached its active Save Slot limit.'],
  ['SAVE_QUOTA_EXCEEDED', 409, false, '云存档空间不足', 'The user-scoped unique blob quota, including pending reservations, would be exceeded.'],
  ['SAVE_FILE_TOO_LARGE', 413, false, '存档文件超过大小限制', 'The save file exceeds the configured per-file byte limit.'],
  ['SAVE_UPLOAD_NOT_FOUND', 404, false, '上传会话不存在', 'The upload session is absent or belongs to another user.'],
  ['SAVE_UPLOAD_EXPIRED', 410, false, '上传会话已过期', 'The upload session expired, was cancelled, or is no longer committable.'],
  ['SAVE_UPLOAD_ALREADY_COMMITTED', 409, false, '上传会话已经提交', 'The upload session has already been committed.'],
  ['SAVE_UPLOAD_OBJECT_MISSING', 409, false, '上传对象尚未到达存储服务', 'No object exists at the exact key bound to this upload session.'],
  ['SAVE_UPLOAD_SIZE_MISMATCH', 409, false, '上传对象大小不匹配', 'The stored object size differs from the expected size.'],
  ['SAVE_UPLOAD_CHECKSUM_MISMATCH', 409, false, '上传对象校验失败', 'The stored object SHA-256 differs from the expected checksum.'],
  ['SAVE_CONFLICT', 409, false, '云存档已有更新', 'The cloud head changed since the submitted base Snapshot.'],
  ['SAVE_BASE_SNAPSHOT_INVALID', 409, false, '基准快照无效', 'The supplied base Snapshot is deleted, absent, or belongs to another Slot.'],
  ['SAVE_SNAPSHOT_NOT_FOUND', 404, false, '快照不存在', 'The Snapshot does not exist or is not owned by the caller.'],
  ['SAVE_CURRENT_SNAPSHOT_DELETE_FORBIDDEN', 409, false, '当前快照不能单独删除', 'The current Snapshot must be replaced or its whole Slot deleted first.'],
  ['SAVE_INVALID_HASH', 400, false, 'SHA-256 格式无效', 'The submitted SHA-256 must be 64 lowercase hexadecimal characters.'],
  ['SAVE_INVALID_METADATA', 400, false, '存档元数据无效', 'The submitted save metadata failed validation or exceeded configured bounds.'],
  ['SAVE_STORAGE_UNAVAILABLE', 503, true, '云存档存储暂不可用', 'The configured local save storage is unavailable or not ready.'],
];

for (const [code, httpStatus, retryable, defaultMessage, description] of SOCIAL_MULTIPLAYER_ERRORS) {
  V1_ERROR_CODES[code] = { code, httpStatus, retryable, defaultMessage, description };
}
for (const [code, httpStatus, retryable, defaultMessage, description] of CLOUD_SAVE_ERRORS) {
  V1_ERROR_CODES[code] = { code, httpStatus, retryable, defaultMessage, description };
}

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
