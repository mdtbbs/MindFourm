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
  RESOURCE_STORAGE_UNAVAILABLE: {
    code: 'RESOURCE_STORAGE_UNAVAILABLE', httpStatus: 503, retryable: true,
    defaultMessage: '资源存储服务暂不可用，请稍后重试', description: 'RES is disabled, unavailable, timed out, or service credentials were rejected.',
  },
  RESOURCE_STORAGE_OBJECT_NOT_FOUND: {
    code: 'RESOURCE_STORAGE_OBJECT_NOT_FOUND', httpStatus: 404, retryable: false,
    defaultMessage: '资源存储对象不存在', description: 'The referenced RES object does not exist.',
  },
  RESOURCE_STORAGE_REJECTED: {
    code: 'RESOURCE_STORAGE_REJECTED', httpStatus: 422, retryable: false,
    defaultMessage: '资源存储对象校验失败', description: 'RES rejected the request or returned invalid object metadata.',
  },
  DOC_NOT_FOUND: {
    code: 'DOC_NOT_FOUND', httpStatus: 404, retryable: false,
    defaultMessage: '文档页面不存在',
    description: 'The requested developer documentation page or API reference is not available.',
  },
  CONTENT_REQUIRED: {
    code: 'CONTENT_REQUIRED', httpStatus: 400, retryable: false,
    defaultMessage: '正文不能为空',
    description: 'The submitted rich-text or Markdown body is empty.',
  },
  CONTENT_TOO_LARGE: {
    code: 'CONTENT_TOO_LARGE', httpStatus: 400, retryable: false,
    defaultMessage: '正文过长',
    description: 'The submitted text body exceeds the configured size limit.',
  },
  INVALID_BLUEPRINT: {
    code: 'INVALID_BLUEPRINT', httpStatus: 422, retryable: false,
    defaultMessage: '蓝图代码无效或超出大小限制',
    description: 'The submitted Mindustry blueprint cannot be parsed or exceeds server limits.',
  },
  INVALID_MAP: {
    code: 'INVALID_MAP', httpStatus: 422, retryable: false,
    defaultMessage: '地图文件无法解析或超出服务端限制',
    description: 'The submitted Mindustry map cannot be parsed or exceeds server limits.',
  },
  LANLINK_UNAVAILABLE: {
    code: 'LANLINK_UNAVAILABLE', httpStatus: 503, retryable: true,
    defaultMessage: '联机大厅暂时无法连接，请稍后重试',
    description: 'The LanLink room service is disabled or unavailable; upstream failures may return 502.',
  },
  LANLINK_UPSTREAM_INVALID: {
    code: 'LANLINK_UPSTREAM_INVALID', httpStatus: 502, retryable: true,
    defaultMessage: '联机大厅返回了无效数据',
    description: 'The LanLink room service returned a response that could not be parsed or projected.',
  },
  LANLINK_QUICK_CODE_ATTEMPTS_EXCEEDED: {
    code: 'LANLINK_QUICK_CODE_ATTEMPTS_EXCEEDED', httpStatus: 429, retryable: true,
    defaultMessage: '识别码校验失败次数过多，请稍后重试',
    description: 'The legacy quick-code route refused further submissions after too many failed guesses from one key and client address. Successful submissions do not consume this budget.',
  },
  SECURITY_DEPENDENCY_UNAVAILABLE: {
    code: 'SECURITY_DEPENDENCY_UNAVAILABLE', httpStatus: 503, retryable: true,
    defaultMessage: '安全依赖暂不可用，请稍后重试',
    description: 'An authentication-sensitive route refused to proceed because the shared Redis rate limiter was unreachable. No credential or identity resolution was performed; retry once the dependency recovers.',
  },
  MESSAGING_DISABLED: {
    code: 'MESSAGING_DISABLED', httpStatus: 403, retryable: false,
    defaultMessage: '站点已关闭私信功能',
    description: 'Private messaging is disabled by site configuration.',
  },
  NOTICE_NOT_FOUND: {
    code: 'NOTICE_NOT_FOUND', httpStatus: 404, retryable: false,
    defaultMessage: '公告不存在或不可见',
    description: 'The requested notice does not exist or is not visible to the caller.',
  },
  REPLIES_UNAVAILABLE: {
    code: 'REPLIES_UNAVAILABLE', httpStatus: 503, retryable: true,
    defaultMessage: '回复暂不可用',
    description: 'The reply service is not available for this request.',
  },
  RESOURCE_UPLOAD_DISABLED: {
    code: 'RESOURCE_UPLOAD_DISABLED', httpStatus: 403, retryable: false,
    defaultMessage: '站点已关闭资源上传',
    description: 'Resource uploads are disabled by site configuration.',
  },
  SEARCH_UNAVAILABLE: {
    code: 'SEARCH_UNAVAILABLE', httpStatus: 503, retryable: true,
    defaultMessage: '搜索服务暂不可用',
    description: 'The search service is not available for this request.',
  },
  TERMS_ACCEPTANCE_REQUIRED: {
    code: 'TERMS_ACCEPTANCE_REQUIRED', httpStatus: 403, retryable: false,
    defaultMessage: '请先接受社区条款',
    description: 'The account must accept the current community terms before continuing.',
  },
  THIRD_PARTY_ACCESS_DISABLED: {
    code: 'THIRD_PARTY_ACCESS_DISABLED', httpStatus: 403, retryable: false,
    defaultMessage: '站点未开放第三方客户端私信访问',
    description: 'Third-party clients cannot access private messaging on this deployment.',
  },
  USER_BANNED: {
    code: 'USER_BANNED', httpStatus: 403, retryable: false,
    defaultMessage: '账号当前不可使用此服务',
    description: 'The account is banned from using this service.',
  },
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
  ['PRESENCE_CONNECTION_LIMIT_REACHED', 409, false, 'Presence 并发连接数已达上限', 'The account already has the maximum number of active Presence connections.'],
  ['ACTIVITY_INVALID', 400, false, '活动数据无效', 'The submitted Rich Activity or Realtime protocol message is invalid.'],
  ['SESSION_NOT_FOUND', 404, false, '联机会话不存在', 'The requested Session does not exist.'],
  ['SESSION_EXPIRED', 404, false, '联机会话已过期', 'The requested Session has expired.'],
  ['SESSION_CLOSED', 404, false, '联机会话已关闭', 'The requested Session is closed.'],
  ['SESSION_ALREADY_ACTIVE', 409, false, '账号已有活跃联机会话', 'The account already owns an active Session; the existing session_id is included in error.details.'],
  ['SESSION_FULL', 409, false, '联机会话人数已满', 'The Session has reached its player capacity.'],
  ['SESSION_NOT_JOINABLE', 400, false, '联机会话当前不可加入', 'The Session configuration does not allow this join path.'],
  ['SESSION_MODS_INVALID', 400, false, '联机模组清单无效', 'The Session mod list is invalid: mutually exclusive inputs, duplicates, or an unavailable Pack.'],
  ['SESSION_PERMISSION_DENIED', 403, false, '无权访问此联机会话', 'The caller cannot view or join this Session.'],
  ['PEER_NOT_FOUND', 404, false, '联机 Peer 不存在', 'The requested Peer does not exist in this Session.'],
  ['PEER_EXPIRED', 404, false, '联机 Peer 已过期', 'The Peer has left or expired.'],
  ['PEER_RESUME_INVALID', 403, false, 'Peer 恢复凭证无效', 'The one-time resume token is expired, consumed, or bound to another client.'],
  ['CANDIDATE_INVALID', 400, false, '连接候选数据无效', 'The Candidate payload or identifier is invalid.'],
  ['CANDIDATE_LIMIT_REACHED', 429, true, '连接候选数量已达上限', 'The per-Peer Candidate limit has been reached.'],
  ['INVITE_NOT_FOUND', 404, false, '联机邀请不存在', 'The invite does not exist or is not addressed to the caller.'],
  ['INVITE_LIMIT_REACHED', 409, false, '待处理联机邀请已达上限', 'The sender already has the maximum number of pending invites.'],
  ['INVITE_EXPIRED', 410, false, '联机邀请已过期', 'The invite has expired.'],
  ['INVITE_ALREADY_ACCEPTED', 410, false, '已接受的邀请 Join Intent 状态无法安全恢复', 'The accepted invite does not have a recoverable Join Intent state.'],
  ['JOIN_REQUEST_REQUIRED', 409, false, '需要先请求房主批准加入', 'The Session requires an approved join request.'],
  ['JOIN_REQUEST_EXPIRED', 410, false, '加入请求不存在或已过期', 'The join request is missing or expired.'],
  ['JOIN_INTENT_INVALID', 403, false, '加入凭证不属于当前用户', 'The one-time Join Intent is bound to another user.'],
  ['JOIN_INTENT_CLIENT_MISMATCH', 403, false, '加入凭证已绑定到另一个 OAuth 客户端', 'The Join Intent is bound to a different OAuth client.'],
  ['JOIN_INTENT_EXPIRED', 410, false, '加入凭证已过期', 'The one-time Join Intent has expired.'],
  ['JOIN_INTENT_CONSUMED', 409, false, '加入凭证已使用', 'The one-time Join Intent was already consumed.'],
  ['JOIN_INTENT_RECOVERY_EXPIRED', 410, false, '加入结果恢复窗口已过期', 'The Join Intent result recovery window has expired.'],
  ['JOIN_INTENT_RECOVERY_UNAVAILABLE', 503, true, '联机恢复密钥暂不可用', 'The server cannot derive a stable Join Intent or resume token right now.'],
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
  ['SAVE_MANIFEST_INVALID', 400, false, '存档清单无效', 'The manifest is malformed, contains an unsafe path, or repeats a path.'],
  ['SAVE_MANIFEST_LIMIT_EXCEEDED', 413, false, '存档清单超出限制', 'The manifest exceeds the configured file count or serialized size limit.'],
  ['SAVE_BLOB_MISSING', 409, false, '缺少存档文件', 'One or more manifest files have no uploaded blob owned by the caller.'],
  ['SAVE_BLOB_NOT_IN_SNAPSHOT', 404, false, '快照不包含该文件', 'The requested blob is not part of this manifest snapshot.'],
  ['SAVE_SNAPSHOT_FORMAT_MISMATCH', 409, false, '快照格式不匹配', 'The Snapshot format does not support the requested operation; use the whole-package or manifest endpoint instead.'],
  ['SAVE_STORAGE_UNAVAILABLE', 503, true, '云存档存储暂不可用', 'The configured local save storage is unavailable or not ready.'],
];

const SQUAD_SAVE_ERRORS: ReadonlyArray<readonly [string, number, boolean, string, string]> = [
  ['SQUADS_DISABLED', 403, false, '小队共享存档功能尚未启用', 'Squad Saves is disabled for this deployment, or personal Cloud Saves is disabled.'],
  ['SQUAD_INVALID_METADATA', 400, false, '小队数据无效', 'A squad, slot, member or device field failed validation.'],
  ['SQUAD_NOT_FOUND', 404, false, '小队不存在', 'The Squad does not exist or was deleted.'],
  ['SQUAD_PERMISSION_DENIED', 403, false, '没有小队操作权限', 'The caller is not an active member, or lacks the role this operation requires.'],
  ['SQUAD_LIMIT_EXCEEDED', 409, false, '已达到可创建的小队数量上限', 'The account already owns the maximum number of active squads.'],
  ['SQUAD_MEMBER_LIMIT_EXCEEDED', 409, false, '小队成员数量已达上限', 'Accepting the invitation would exceed the squad member limit.'],
  ['SQUAD_MEMBER_ALREADY_EXISTS', 409, false, '该用户已经是小队成员', 'The target account is already an active member.'],
  ['SQUAD_MEMBER_NOT_FOUND', 404, false, '小队成员不存在', 'The target account is not an active member of this squad.'],
  ['SQUAD_FRIEND_REQUIRED', 403, false, '只能邀请好友', 'Squad invitations are limited to accepted friends.'],
  ['SQUAD_INVITE_NOT_FOUND', 404, false, '没有待接受的小队邀请', 'The caller has no pending invitation to this squad.'],
  ['SQUAD_OWNER_ROLE_IMMUTABLE', 409, false, '队长角色不可直接修改', 'The owner role can only change through the two-step ownership transfer.'],
  ['SQUAD_OWNER_MUST_TRANSFER', 409, false, '队长需先完成转让', 'The owner must transfer ownership before leaving the squad.'],
  ['SQUAD_TRANSFER_NOT_FOUND', 404, false, '没有待确认的队长转让', 'No pending ownership transfer exists for this squad.'],
  ['SQUAD_TRANSFER_PENDING', 409, false, '已有待确认的队长转让', 'A squad may have at most one pending ownership transfer.'],
  ['SQUAD_TRANSFER_EXPIRED', 410, false, '队长转让已过期', 'The ownership transfer expired before it was accepted or declined.'],
  ['SQUAD_TRANSFER_STALE', 409, false, '队长转让状态已变化', 'The squad owner changed while the transfer was pending.'],
  ['SQUAD_TRANSFER_QUOTA_EXCEEDED', 409, false, '新队长配额不足', 'The new owner cannot absorb the squad bytes within their Cloud Save quota.'],
  ['SQUAD_SLOT_LIMIT_EXCEEDED', 409, false, '小队存档槽数量已达上限', 'The squad already has its maximum number of shared save slots.'],
  ['SQUAD_SAVE_SLOT_NOT_FOUND', 404, false, '小队存档槽不存在', 'The shared save slot does not exist or was deleted.'],
  ['SQUAD_SAVE_SNAPSHOT_NOT_FOUND', 404, false, '小队快照不存在', 'The shared save snapshot does not exist or was deleted.'],
  ['SQUAD_SAVE_HEAD_SNAPSHOT_DELETE_FORBIDDEN', 409, false, '主链当前快照不能单独删除', 'The head snapshot must be replaced by a newer commit or the slot deleted first.'],
  ['SQUAD_SAVE_PIN_LIMIT_EXCEEDED', 409, false, '置顶快照数量已达上限', 'A shared save slot may pin at most ten snapshots.'],
  ['SQUAD_SAVE_BLOB_MISSING', 409, false, '缺少小队存档文件', 'One or more manifest files have no uploaded blob in this squad.'],
  ['SQUAD_SAVE_BLOB_NOT_IN_SNAPSHOT', 404, false, '快照不包含该文件', 'The requested blob is not part of this shared save snapshot.'],
  ['SQUAD_SAVE_BASE_SNAPSHOT_INVALID', 409, false, '基准快照无效', 'The supplied base snapshot is deleted or belongs to another slot.'],
  ['SQUAD_SAVE_CONFLICT', 409, false, '共享存档已有更新', 'The main-chain head changed since the submitted base snapshot.'],
  ['SQUAD_SAVE_INVALID_HASH', 400, false, 'SHA-256 格式无效', 'The submitted SHA-256 must be 64 lowercase hexadecimal characters.'],
  ['SQUAD_SAVE_FILE_TOO_LARGE', 413, false, '存档文件超过大小限制', 'The file exceeds the configured per-file byte limit.'],
  ['SQUAD_SAVE_SIZE_MISMATCH', 409, false, '上传对象大小不匹配', 'The stored object size differs from the declared size.'],
  ['SQUAD_SAVE_CHECKSUM_MISMATCH', 409, false, '上传对象校验失败', 'The stored object SHA-256 differs from the declared checksum.'],
  ['SQUAD_SAVE_STORAGE_UNAVAILABLE', 503, true, '小队存档存储暂不可用', 'The configured save storage is unavailable, or a referenced object is missing.'],
  ['SQUAD_SAVE_UPLOAD_NOT_FOUND', 404, false, '小队上传会话不存在', 'The upload session is absent or belongs to another member.'],
  ['SQUAD_SAVE_UPLOAD_EXPIRED', 410, false, '小队上传会话已过期', 'The upload session expired or is no longer committable.'],
  ['SQUAD_OWNER_QUOTA_EXCEEDED', 409, false, '小队创建者云存档空间不足', 'The owner-scoped unified quota (personal plus owned squad bytes) would be exceeded.'],
  ['SQUAD_OWNER_CHANGED', 409, true, '小队队长已变化', 'Ownership changed while the caller was staging or committing a squad save; retry the operation.'],
  ['SQUAD_SAVE_LEASE_HELD', 409, false, '存档槽已由其他房主持有', 'An unexpired write lease is held by another member; join that room or take over as owner/admin.'],
  ['SQUAD_SAVE_LEASE_STALE', 409, false, '写租约已失效', 'The fencing token is stale, expired, or no longer held by the caller.'],
  ['SQUAD_SAVE_LEASE_REQUIRED', 409, false, '需要先获取写租约', 'The caller must hold the active write lease before staging squad save files.'],
  ['SQUAD_TAKEOVER_FORBIDDEN', 403, false, '无权强制接管租约', 'Only the owner or an admin may force-take-over an unexpired lease.'],
];

for (const [code, httpStatus, retryable, defaultMessage, description] of SOCIAL_MULTIPLAYER_ERRORS) {
  V1_ERROR_CODES[code] = { code, httpStatus, retryable, defaultMessage, description };
}
for (const [code, httpStatus, retryable, defaultMessage, description] of CLOUD_SAVE_ERRORS) {
  V1_ERROR_CODES[code] = { code, httpStatus, retryable, defaultMessage, description };
}
for (const [code, httpStatus, retryable, defaultMessage, description] of SQUAD_SAVE_ERRORS) {
  V1_ERROR_CODES[code] = { code, httpStatus, retryable, defaultMessage, description };
}

/**
 * Generic Blob API (`/api/v1/blobs`).
 *
 * Codes follow the `BLOB_*` prefix so a client can branch on the prefix; the
 * `upload` family mirrors the cloud-save upload state machine, which is
 * intentional — the two endpoints expose the same declare/upload/commit steps.
 */
const BLOB_ERRORS: ReadonlyArray<readonly [string, number, boolean, string, string]> = [
  ['BLOBS_DISABLED', 403, false, 'blob 存储功能尚未启用', 'Generic blob storage is disabled for this deployment.'],
  ['BLOB_NOT_FOUND', 404, false, 'blob 不存在', 'The blob is absent, deleted, expired, or not visible to the caller.'],
  ['BLOB_KEY_INVALID', 400, false, 'blob key 或 namespace 无效', 'The namespace or logical key is malformed or reserved.'],
  ['BLOB_KEY_CONFLICT', 409, false, 'blob key 已被占用', 'Another live blob already uses this key in the namespace.'],
  ['BLOB_METADATA_INVALID', 400, false, 'blob 元数据无效', 'Filename, MIME type, metadata, tags, reference or expiry failed validation.'],
  ['BLOB_INVALID_HASH', 400, false, 'SHA-256 格式无效', 'The sha256 field is not 64 hexadecimal characters.'],
  ['BLOB_FILE_TOO_LARGE', 413, false, '文件超过单对象大小限制', 'The declared or received size exceeds the per-object limit.'],
  ['BLOB_QUOTA_EXCEEDED', 409, false, 'blob 存储空间不足', 'The per-owner byte quota, including reserved uploads, would be exceeded.'],
  ['BLOB_UPLOAD_NOT_FOUND', 404, false, '上传会话不存在', 'The upload session is absent or belongs to another owner.'],
  ['BLOB_UPLOAD_EXPIRED', 410, false, '上传会话已过期', 'The upload session expired, was cancelled, or is no longer committable.'],
  ['BLOB_UPLOAD_ALREADY_COMMITTED', 409, false, '上传会话已经提交', 'The upload session has already been committed.'],
  ['BLOB_UPLOAD_OBJECT_MISSING', 409, false, '上传对象尚未到达存储服务', 'No object exists at the key bound to this upload session.'],
  ['BLOB_UPLOAD_SIZE_MISMATCH', 409, false, '上传对象大小不匹配', 'The stored object size differs from the declared size.'],
  ['BLOB_UPLOAD_CHECKSUM_MISMATCH', 409, false, '上传对象校验失败', 'The stored object SHA-256 differs from the declared checksum.'],
  ['BLOB_UPLOAD_LIMIT_REACHED', 429, true, '未完成的上传会话过多', 'The account has too many open upload sessions; commit or cancel some first.'],
  ['BLOB_STORAGE_UNAVAILABLE', 503, true, 'blob 存储暂不可用', 'The blob storage backend is unavailable or misconfigured.'],
];

for (const [code, httpStatus, retryable, defaultMessage, description] of BLOB_ERRORS) {
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
