/**
 * 基地延时摄影（Timelapse / 战报）模块的共享常量与协议类型。
 *
 * 这些值同时被控制面服务、渲染 Worker 和前端使用，必须保持单一来源：
 * Worker 只依赖纯函数与协议常量，不依赖 Nest 或数据库。
 */

/** 战报生命周期状态。 */
export const TIMELAPSE_STATUSES = [
  'uploading',
  'queued',
  'processing',
  'pending_review',
  'published',
  'rejected',
  'failed',
] as const;
export type TimelapseStatus = typeof TIMELAPSE_STATUSES[number];

export const TIMELAPSE_VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type TimelapseVisibility = typeof TIMELAPSE_VISIBILITIES[number];

/** 处于“占用并发额度”的状态；同一账号同时只允许 1 个。 */
export const TIMELAPSE_ACTIVE_STATUSES: readonly TimelapseStatus[] = ['uploading', 'queued', 'processing'];

/** 原始帧包上限 25 MB。 */
export const TIMELAPSE_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** 解压后总大小上限 80 MB（Worker 强制执行）。 */
export const TIMELAPSE_MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
/** 单帧解压后上限；1024×1024 的 PNG 远低于此值。 */
export const TIMELAPSE_MAX_FRAME_BYTES = 4 * 1024 * 1024;
export const TIMELAPSE_MIN_FRAMES = 5;
export const TIMELAPSE_MAX_FRAMES = 180;
export const TIMELAPSE_MAX_FRAME_DIMENSION = 1024;
export const TIMELAPSE_MAX_MANIFEST_BYTES = 64 * 1024;
export const TIMELAPSE_MAX_METRICS_LINE_BYTES = 4 * 1024;
export const TIMELAPSE_MAX_METRICS_LINES = 1000;
export const TIMELAPSE_MAX_METRICS_POINTS = 120;
export const TIMELAPSE_MAX_SUMMARY_BYTES = 60 * 1024;
/** Worker 回传的成片上限；720p/30s 的 H.264 远低于此值。 */
export const TIMELAPSE_MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const TIMELAPSE_MAX_POSTER_BYTES = 2 * 1024 * 1024;

/** 防滥用额度（D15）。 */
export const TIMELAPSE_UNBOUND_DRAFT_LIMIT = 20;
export const TIMELAPSE_HOURLY_UPLOAD_LIMIT = 3;
export const TIMELAPSE_DAILY_UPLOAD_LIMIT = 10;
export const TIMELAPSE_CONCURRENT_LIMIT = 1;
/** 未绑定帖子的草稿保留 30 天。 */
export const TIMELAPSE_DRAFT_TTL_DAYS = 30;
/** 合成完成后原始帧包保留 24 小时。 */
export const TIMELAPSE_SOURCE_PURGE_HOURS = 24;
/** 队列任务在 processing 列表中超过该时长视为 Worker 失联。 */
export const TIMELAPSE_PROCESSING_TIMEOUT_MINUTES = 30;
/** 上传会话（尚未 commit）的最长保留时间。 */
export const TIMELAPSE_UPLOAD_TIMEOUT_HOURS = 24;

/** 每篇帖子最多嵌入 3 个战报。 */
export const TIMELAPSE_MAX_REPORTS_PER_POST = 3;

/** Redis 队列名（Worker 独立进程消费）。 */
export const TIMELAPSE_JOB_QUEUE = 'forum:timelapse:jobs';
export const TIMELAPSE_PROCESSING_QUEUE = 'forum:timelapse:processing';

/** 渲染 Worker 的合成参数。 */
export const TIMELAPSE_FFMPEG_TIMEOUT_MS = 60_000;
export const TIMELAPSE_RENDER_FPS_MIN = 4;
export const TIMELAPSE_RENDER_FPS_MAX = 15;
export const TIMELAPSE_RENDER_TARGET_SECONDS = 18;
export const TIMELAPSE_RENDER_SIZE = 720;
export const TIMELAPSE_WORKER_VERSION = 'mdtbbs-timelapse-worker-1';

/** 内部签名 URL 的默认有效期（秒）。 */
export const TIMELAPSE_INTERNAL_URL_TTL_SECONDS = 60 * 60;

/** 客户端上传/查询接口返回的图表点。 */
export interface TimelapseMetricPoint {
  /** 帧序号（0 起）。 */
  t: number;
  elapsed_sec: number;
  wave: number;
  power_gen: number;
  power_use: number;
  power_stored: number;
  core_items: number;
  item_rate_per_min: number;
  units_ally: number;
  units_enemy: number;
  buildings_ally: number;
  players_online: number;
}

/** `highlights_json`：用于前端徽章与卡片摘要。 */
export interface TimelapseHighlights {
  peak_power_gen: number;
  peak_power_use: number;
  peak_power_stored: number;
  peak_item_rate_per_min: number;
  max_wave: number;
  peak_buildings_ally: number;
  peak_units_ally: number;
  peak_units_enemy: number;
}

export interface TimelapseAuthorDto {
  id: number;
  username: string;
  avatar_url: string | null;
}

/** `GET /api/v1/timelapses/{id}` 的响应体。 */
export interface TimelapsePublicDto {
  id: string;
  status: TimelapseStatus;
  visibility: TimelapseVisibility;
  author: TimelapseAuthorDto;
  map_name: string;
  map_width: number | null;
  map_height: number | null;
  game_mode: string | null;
  game_version: string | null;
  is_multiplayer: boolean;
  max_wave: number;
  duration_seconds: number;
  frame_count: number;
  video_url: string | null;
  poster_url: string | null;
  metrics: TimelapseMetricPoint[];
  highlights: TimelapseHighlights;
  created_at: string;
  published_at: string | null;
  /** 仅作者或管理员可见的审核说明。 */
  review_reason: string | null;
  failure_code: string | null;
  failure_reason: string | null;
}

/** 渲染队列消息（控制面 → Worker）。 */
export interface TimelapseRenderJob {
  version: 1;
  job_id: string;
  timelapse_id: string;
  author_user_id: number;
  source_sha256: string;
  source_size_bytes: number;
  source_url: string;
  start_url: string;
  video_upload_url: string;
  poster_upload_url: string;
  result_url: string;
  expires_at: string;
  signature: string;
}

/** Worker → 控制面的结果元数据。 */
export interface TimelapseRenderResult {
  job_id: string;
  status: 'completed' | 'failed';
  map_name?: string;
  map_width?: number | null;
  map_height?: number | null;
  game_mode?: string | null;
  game_version?: string | null;
  is_multiplayer?: boolean;
  max_wave?: number;
  duration_seconds?: number;
  frame_count?: number;
  summary_metrics?: TimelapseMetricPoint[];
  highlights?: TimelapseHighlights;
  failure_code?: string;
  failure_reason?: string;
  worker_version?: string;
}

/** 单个战报对象的存储键（相对于存储根目录）。 */
export function timelapseSourceKey(publicId: string): string | undefined {
  return isSafePublicId(publicId) ? `source/${publicId}.zip` : undefined;
}
export function timelapseVideoKey(publicId: string): string | undefined {
  return isSafePublicId(publicId) ? `video/${publicId}.mp4` : undefined;
}
export function timelapsePosterKey(publicId: string): string | undefined {
  return isSafePublicId(publicId) ? `poster/${publicId}.webp` : undefined;
}

const PUBLIC_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isSafePublicId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_ID_RE.test(value);
}

export function clampRenderFps(frameCount: number): number {
  const raw = frameCount / TIMELAPSE_RENDER_TARGET_SECONDS;
  return Math.min(TIMELAPSE_RENDER_FPS_MAX, Math.max(TIMELAPSE_RENDER_FPS_MIN, Math.round(raw * 100) / 100));
}
