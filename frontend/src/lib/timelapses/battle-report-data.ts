/**
 * 基地延时战报的前端数据工具。
 *
 * API 返回的数据在进入播放器与图表前统一经过这里的纯函数清洗：数值必须有限且
 * 非负、图表点数有上限、媒体地址只接受同源路径或 http(s)。这里不依赖 React、
 * DOM 或网络，既方便单元测试，也保证不可信响应不会被直接渲染。
 */

export const BATTLE_REPORT_PUBLIC_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 图表最多保留的数据点。服务端正常只返回 120 个，这里是防御上限。 */
export const BATTLE_REPORT_MAX_METRIC_POINTS = 240;

export const BATTLE_REPORT_STATUSES = [
  'uploading',
  'queued',
  'processing',
  'pending_review',
  'published',
  'rejected',
  'failed',
] as const;
export type BattleReportStatus = typeof BATTLE_REPORT_STATUSES[number];

export interface TimelapseMetricPoint {
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

export type BattleReportSeriesKey = Exclude<keyof TimelapseMetricPoint, 't' | 'elapsed_sec'>;

export interface BattleReportSeriesPoint {
  x: number;
  y: number;
}

export interface BattleReportWaveMarker {
  wave: number;
  fraction: number;
}

/** 图表共享坐标域；不传时由数据自身的极值推导。 */
export interface BattleReportSeriesDomain {
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface BattleReportHighlights {
  peakPowerGen: number;
  peakPowerUse: number;
  peakPowerStored: number;
  peakItemRatePerMin: number;
  maxWave: number;
  peakBuildingsAlly: number;
  peakUnitsAlly: number;
  peakUnitsEnemy: number;
}

export interface BattleReportAuthor {
  id: number;
  username: string;
  avatarUrl: string | null;
}

export interface BattleReportData {
  id: string;
  status: BattleReportStatus;
  visibility: string;
  author: BattleReportAuthor;
  mapName: string;
  maxWave: number;
  durationSeconds: number;
  frameCount: number;
  videoUrl: string | null;
  posterUrl: string | null;
  metrics: TimelapseMetricPoint[];
  highlights: BattleReportHighlights;
  reviewReason: string | null;
  failureCode: string | null;
  failureReason: string | null;
}

export function isBattleReportPublicId(value: unknown): value is string {
  return typeof value === 'string' && BATTLE_REPORT_PUBLIC_ID_RE.test(value);
}

/** 数字或数字字符串 → 有限非负数；其余一律记 0。 */
function nonNegativeNumber(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function nonNegativeInteger(value: unknown): number {
  return Math.floor(nonNegativeNumber(value));
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function optionalText(value: unknown, maxLength: number): string | null {
  const text = boundedText(value, maxLength);
  return text || null;
}

/** 超过上限时均匀抽样，保留首尾，避免截断丢掉后半段战况。 */
function limitMetricPoints(points: TimelapseMetricPoint[], max: number): TimelapseMetricPoint[] {
  if (points.length <= max) return points;
  const sampled: TimelapseMetricPoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let index = 0; index < max; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  return sampled;
}

/**
 * 清洗 metrics：丢弃非对象条目，所有数值转成有限非负数，按 elapsed_sec 排序，
 * 并最多保留 240 点。前端永远不假设 API 数据一定合法。
 */
export function normalizeBattleReportMetrics(value: unknown): TimelapseMetricPoint[] {
  if (!Array.isArray(value)) return [];
  const points: TimelapseMetricPoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    points.push({
      t: nonNegativeInteger(entry.t),
      elapsed_sec: nonNegativeNumber(entry.elapsed_sec),
      wave: nonNegativeInteger(entry.wave),
      power_gen: nonNegativeNumber(entry.power_gen),
      power_use: nonNegativeNumber(entry.power_use),
      power_stored: nonNegativeNumber(entry.power_stored),
      core_items: nonNegativeNumber(entry.core_items),
      item_rate_per_min: nonNegativeNumber(entry.item_rate_per_min),
      units_ally: nonNegativeNumber(entry.units_ally),
      units_enemy: nonNegativeNumber(entry.units_enemy),
      buildings_ally: nonNegativeNumber(entry.buildings_ally),
      players_online: nonNegativeNumber(entry.players_online),
    });
  }
  points.sort((left, right) => left.elapsed_sec - right.elapsed_sec);
  return limitMetricPoints(points, BATTLE_REPORT_MAX_METRIC_POINTS);
}

/** 提取一条可绘制的折线序列，x 固定为战斗时间。 */
export function buildSeries(
  points: readonly TimelapseMetricPoint[],
  key: BattleReportSeriesKey,
): BattleReportSeriesPoint[] {
  return points
    .filter((point) => Number.isFinite(point.elapsed_sec))
    .map((point) => ({
      x: Math.max(0, point.elapsed_sec),
      y: nonNegativeNumber(point[key]),
    }));
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveDomain(series: readonly BattleReportSeriesPoint[], domain: BattleReportSeriesDomain) {
  const points = series.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const hasXMax = typeof domain.xMax === 'number' && Number.isFinite(domain.xMax);
  const hasYMax = typeof domain.yMax === 'number' && Number.isFinite(domain.yMax);
  const xMin = hasXMax ? (typeof domain.xMin === 'number' && Number.isFinite(domain.xMin) ? domain.xMin : 0) : Math.min(...xs);
  const xMax = hasXMax ? (domain.xMax as number) : Math.max(...xs);
  const yMin = hasYMax ? (typeof domain.yMin === 'number' && Number.isFinite(domain.yMin) ? domain.yMin : 0) : Math.min(...ys);
  const yMax = hasYMax ? (domain.yMax as number) : Math.max(...ys);
  return { xMin, xMax, yMin, yMax };
}

function projectPoint(x: number, y: number, width: number, height: number, bounds: ReturnType<typeof resolveDomain>) {
  if (!bounds) return null;
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const rawX = xSpan > 0 ? ((x - bounds.xMin) / xSpan) * width : width / 2;
  const rawY = ySpan > 0 ? height - ((y - bounds.yMin) / ySpan) * height : height / 2;
  return {
    x: roundCoordinate(Math.min(width, Math.max(0, rawX))),
    y: roundCoordinate(Math.min(height, Math.max(0, rawY))),
  };
}

function mapSeries(
  series: readonly BattleReportSeriesPoint[],
  width: number,
  height: number,
  domain: BattleReportSeriesDomain,
) {
  if (!(Number.isFinite(width) && width > 0) || !(Number.isFinite(height) && height > 0)) return [];
  const bounds = resolveDomain(series, domain);
  if (!bounds) return [];
  return series
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => projectPoint(point.x, point.y, width, height, bounds))
    .filter((point): point is { x: number; y: number } => Boolean(point));
}

/** 把单个点投影到图表坐标；不传域时按该点自身居中。 */
export function mapSeriesPoint(
  point: BattleReportSeriesPoint,
  width: number,
  height: number,
  domain: BattleReportSeriesDomain = {},
): { x: number; y: number } | null {
  const mapped = mapSeries([point], width, height, domain);
  return mapped[0] || null;
}

/**
 * SVG polyline 的点串。坐标空间为 [0,width] × [0,height]，y 轴已翻转。
 * 传入共享 domain 时多组序列使用同一刻度；否则各自取极值。
 */
export function polylinePoints(
  series: readonly BattleReportSeriesPoint[],
  width: number,
  height: number,
  domain: BattleReportSeriesDomain = {},
): string {
  return mapSeries(series, width, height, domain)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

/** 折线下方的面积多边形（用于储能等面积图）。 */
export function areaPolygonPoints(
  series: readonly BattleReportSeriesPoint[],
  width: number,
  height: number,
  domain: BattleReportSeriesDomain = {},
): string {
  const mapped = mapSeries(series, width, height, domain);
  if (!mapped.length) return '';
  const baseline = roundCoordinate(height);
  const first = mapped[0];
  const last = mapped[mapped.length - 1];
  const points = [`${first.x},${baseline}`, ...mapped.map((point) => `${point.x},${point.y}`), `${last.x},${baseline}`];
  return points.join(' ');
}

/**
 * 波次变化点：按时间排序后只保留第一次出现的每个波次，fraction 为
 * elapsed_sec / duration（未提供 duration 时使用最后一个采样点的时间）。
 */
export function waveMarkers(
  points: readonly TimelapseMetricPoint[],
  durationSeconds?: number,
): BattleReportWaveMarker[] {
  const ordered = points
    .filter((point) => Number.isFinite(point.elapsed_sec) && Number.isFinite(point.wave))
    .slice()
    .sort((left, right) => left.elapsed_sec - right.elapsed_sec);
  if (!ordered.length) return [];
  const maxElapsed = ordered.reduce((max, point) => Math.max(max, point.elapsed_sec), 0);
  const total = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : maxElapsed;
  const markers: BattleReportWaveMarker[] = [];
  const seen = new Set<number>();
  let previousWave: number | null = null;
  for (const point of ordered) {
    const wave = Math.max(0, Math.floor(point.wave));
    if (wave === previousWave) continue;
    previousWave = wave;
    if (seen.has(wave)) continue;
    seen.add(wave);
    const fraction = total > 0 ? Math.min(1, Math.max(0, point.elapsed_sec / total)) : 0;
    markers.push({ wave, fraction });
  }
  return markers;
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

/** 紧凑数值：999、1.2k、3.4M、1.1B。非有限值按 0 处理。 */
export function formatCompactNumber(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const units = [
    { threshold: 1e12, suffix: 'T' },
    { threshold: 1e9, suffix: 'B' },
    { threshold: 1e6, suffix: 'M' },
    { threshold: 1e3, suffix: 'k' },
  ];
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (absolute < unit.threshold) continue;
    const rounded = Math.round((absolute / unit.threshold) * 10) / 10;
    if (rounded >= 1000 && index > 0) {
      const bigger = units[index - 1];
      return sign + trimDecimal(Math.round((absolute / bigger.threshold) * 10) / 10) + bigger.suffix;
    }
    return sign + trimDecimal(rounded) + unit.suffix;
  }
  const rounded = Math.round(absolute * 10) / 10;
  if (rounded >= 1000) return sign + '1k';
  return sign + trimDecimal(rounded);
}

/** 战斗时长：65 → 1:05；3661 → 1:01:01。 */
export function formatBattleReportDuration(value: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0:00';
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 视频定位：fraction 先夹到 0..1，再乘总时长；无效输入回到 0。 */
export function seekSecondsForFraction(duration: number, fraction: number): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return 0;
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(duration * clamped * 1000) / 1000;
}

/** 只接受同源绝对路径或 http(s) 地址；拒绝协议注入与 `..` 路径。 */
export function safeBattleReportMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || /[\u0000-\u001f\\]/.test(trimmed)) return null;
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//') && !trimmed.split('/').includes('..') ? trimmed : null;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}

/** 与服务端投影一致的战报标题文案。 */
export function battleReportLabel(mapName: unknown, maxWave: unknown): string {
  const name = typeof mapName === 'string'
    ? mapName.replace(/[\r\n]+/g, ' ').replace(/[[\]]/g, '').trim().slice(0, 160)
    : '';
  const wave = nonNegativeInteger(maxWave);
  if (name && wave > 0) return `基地延时战报: ${name} · 最高 ${wave} 波`;
  if (name) return `基地延时战报: ${name}`;
  if (wave > 0) return `基地延时战报 · 最高 ${wave} 波`;
  return '基地延时战报';
}

export function normalizeBattleReportHighlights(value: unknown): BattleReportHighlights {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    peakPowerGen: nonNegativeNumber(raw.peak_power_gen),
    peakPowerUse: nonNegativeNumber(raw.peak_power_use),
    peakPowerStored: nonNegativeNumber(raw.peak_power_stored),
    peakItemRatePerMin: nonNegativeNumber(raw.peak_item_rate_per_min),
    maxWave: nonNegativeInteger(raw.max_wave),
    peakBuildingsAlly: nonNegativeInteger(raw.peak_buildings_ally),
    peakUnitsAlly: nonNegativeInteger(raw.peak_units_ally),
    peakUnitsEnemy: nonNegativeInteger(raw.peak_units_enemy),
  };
}

/**
 * 校验并转换 `GET /api/v1/timelapses/{id}` 的 data。
 * 缺少合法 UUID 或未知状态时返回 null，调用方按“不可见”处理。
 */
export function normalizeBattleReportPayload(value: unknown): BattleReportData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isBattleReportPublicId(raw.id)) return null;
  if (typeof raw.status !== 'string' || !(BATTLE_REPORT_STATUSES as readonly string[]).includes(raw.status)) return null;
  const author = raw.author && typeof raw.author === 'object' && !Array.isArray(raw.author)
    ? raw.author as Record<string, unknown>
    : {};
  return {
    id: raw.id,
    status: raw.status as BattleReportStatus,
    visibility: boundedText(raw.visibility, 32) || 'private',
    author: {
      id: nonNegativeInteger(author.id),
      username: boundedText(author.username, 80) || '匿名用户',
      avatarUrl: safeBattleReportMediaUrl(author.avatar_url),
    },
    mapName: boundedText(raw.map_name, 160),
    maxWave: nonNegativeInteger(raw.max_wave),
    durationSeconds: nonNegativeNumber(raw.duration_seconds),
    frameCount: nonNegativeInteger(raw.frame_count),
    videoUrl: safeBattleReportMediaUrl(raw.video_url),
    posterUrl: safeBattleReportMediaUrl(raw.poster_url),
    metrics: normalizeBattleReportMetrics(raw.metrics),
    highlights: normalizeBattleReportHighlights(raw.highlights),
    reviewReason: optionalText(raw.review_reason, 1000),
    failureCode: optionalText(raw.failure_code, 200),
    failureReason: optionalText(raw.failure_reason, 1000),
  };
}
