/**
 * `metrics.jsonl` 清洗与图表摘要生成。
 *
 * 输入约定（`.mreplay.zip` v1）：
 *   {"idx":0,"elapsed_sec":0,"wave":1,...}
 * 输出使用控制面的 `TimelapseMetricPoint`：`idx` → `t`，未知字段一律丢弃。
 *
 * 清洗规则：
 *   - 单行原始字节 ≤ 4 KB，最多 1000 行；
 *   - 每行必须是 JSON 对象，非对象/坏 JSON 跳过；
 *   - idx 必须是有限非负整数，重复 idx 保留最后一条并按 idx 升序；
 *   - 所有数值必须是有限数，否则记 0，并 clamp 到 [0, 1e12]；
 *   - 均匀降采样到 ≤120 点，保留首尾；序列化后仍超 60 KB 时继续减半。
 */

import {
  TIMELAPSE_MAX_METRICS_LINE_BYTES,
  TIMELAPSE_MAX_METRICS_LINES,
  TIMELAPSE_MAX_METRICS_POINTS,
  TIMELAPSE_MAX_SUMMARY_BYTES,
  type TimelapseHighlights,
  type TimelapseMetricPoint,
} from '../../modules/timelapses/timelapse.constants';
import { TimelapseArchiveError } from './errors';

const MAX_VALUE = 1_000_000_000_000;

/** 输入中的数值字段（`idx` 单独映射为 `t`）。 */
const VALUE_FIELDS = [
  'elapsed_sec',
  'wave',
  'power_gen',
  'power_use',
  'power_stored',
  'core_items',
  'item_rate_per_min',
  'units_ally',
  'units_enemy',
  'buildings_ally',
  'players_online',
] as const satisfies ReadonlyArray<keyof TimelapseMetricPoint>;

export interface TimelapseMetricSummary {
  /** 清洗、降采样后的图表点。 */
  points: TimelapseMetricPoint[];
  /** 由最终点位计算的峰值摘要。 */
  highlights: TimelapseHighlights;
  /** 战斗时长（秒，取所有采样点 elapsed_sec 的最大值并四舍五入）。 */
  durationSeconds: number;
  /** 清洗后、降采样前的点位数，供日志/测试使用。 */
  cleanedPointCount: number;
}

export interface ParseMetricsOptions {
  /** 测试用：覆盖 120 点上限。 */
  maxPoints?: number;
  /** 测试用：覆盖 60 KB 序列化上限。 */
  maxBytes?: number;
}

function clampNumber(value: unknown): number {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return 0;
  return Math.min(MAX_VALUE, Math.max(0, number));
}

function invalid(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_METRICS_INVALID', message);
}

/** 均匀抽样并保留首尾；仅在 points.length > maxPoints 时改变数据。 */
export function downsampleMetricPoints(points: TimelapseMetricPoint[], maxPoints = TIMELAPSE_MAX_METRICS_POINTS): TimelapseMetricPoint[] {
  if (!Number.isInteger(maxPoints) || maxPoints < 1 || points.length <= maxPoints) return points;
  if (maxPoints === 1) return [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);
  const sampled: TimelapseMetricPoint[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round(index * step)]);
  }
  // 浮点误差兜底：最后一个点必须严格对应输入末点。
  sampled[sampled.length - 1] = points[points.length - 1];
  return sampled;
}

/** 序列化超过上限时按“保留偶数位 + 末点”逐步减半。 */
export function trimMetricPointsToByteLimit(
  points: TimelapseMetricPoint[],
  maxBytes = TIMELAPSE_MAX_SUMMARY_BYTES,
): TimelapseMetricPoint[] {
  let result = points;
  while (result.length > 1 && Buffer.byteLength(JSON.stringify(result), 'utf8') > maxBytes) {
    const next = result.filter((_, index) => index % 2 === 0 || index === result.length - 1);
    if (next.length >= result.length) break;
    result = next;
  }
  return result;
}

export function computeMetricHighlights(points: readonly TimelapseMetricPoint[]): TimelapseHighlights {
  const highlights: TimelapseHighlights = {
    peak_power_gen: 0,
    peak_power_use: 0,
    peak_power_stored: 0,
    peak_item_rate_per_min: 0,
    max_wave: 0,
    peak_buildings_ally: 0,
    peak_units_ally: 0,
    peak_units_enemy: 0,
  };
  for (const point of points) {
    highlights.peak_power_gen = Math.max(highlights.peak_power_gen, point.power_gen);
    highlights.peak_power_use = Math.max(highlights.peak_power_use, point.power_use);
    highlights.peak_power_stored = Math.max(highlights.peak_power_stored, point.power_stored);
    highlights.peak_item_rate_per_min = Math.max(highlights.peak_item_rate_per_min, point.item_rate_per_min);
    highlights.max_wave = Math.max(highlights.max_wave, point.wave);
    highlights.peak_buildings_ally = Math.max(highlights.peak_buildings_ally, point.buildings_ally);
    highlights.peak_units_ally = Math.max(highlights.peak_units_ally, point.units_ally);
    highlights.peak_units_enemy = Math.max(highlights.peak_units_enemy, point.units_enemy);
  }
  return highlights;
}

function cleanLine(record: Record<string, unknown>): TimelapseMetricPoint | null {
  const rawIndex = typeof record.idx === 'number'
    ? record.idx
    : typeof record.idx === 'string' && record.idx.trim() !== '' ? Number(record.idx) : Number.NaN;
  if (!Number.isFinite(rawIndex) || rawIndex < 0 || !Number.isInteger(rawIndex)) return null;
  const point = {
    t: Math.round(rawIndex),
    elapsed_sec: 0,
    wave: 0,
    power_gen: 0,
    power_use: 0,
    power_stored: 0,
    core_items: 0,
    item_rate_per_min: 0,
    units_ally: 0,
    units_enemy: 0,
    buildings_ally: 0,
    players_online: 0,
  } as TimelapseMetricPoint;
  for (const field of VALUE_FIELDS) {
    const value = clampNumber(record[field]);
    // wave 表示波次，语义上取整；其余字段保留小数（时间/速率可能非整数）。
    point[field] = field === 'wave' ? Math.round(value) : value;
  }
  return point;
}

/** 解析 metrics.jsonl，返回最终图表点与亮点摘要。 */
export function parseMetricsJsonl(buffer: Buffer, options: ParseMetricsOptions = {}): TimelapseMetricSummary {
  const maxPoints = options.maxPoints ?? TIMELAPSE_MAX_METRICS_POINTS;
  const maxBytes = options.maxBytes ?? TIMELAPSE_MAX_SUMMARY_BYTES;
  if (!Buffer.isBuffer(buffer)) invalid('metrics.jsonl 无法读取。');
  if (buffer.length === 0) {
    return { points: [], highlights: computeMetricHighlights([]), durationSeconds: 0, cleanedPointCount: 0 };
  }

  const byIndex = new Map<number, TimelapseMetricPoint>();
  let lineCount = 0;
  let maxElapsed = 0;
  for (const rawLine of buffer.toString('utf8').split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line.trim()) continue;
    if (Buffer.byteLength(line, 'utf8') > TIMELAPSE_MAX_METRICS_LINE_BYTES) {
      invalid(`metrics.jsonl 单行不能超过 ${TIMELAPSE_MAX_METRICS_LINE_BYTES} 字节。`);
    }
    lineCount += 1;
    if (lineCount > TIMELAPSE_MAX_METRICS_LINES) {
      invalid(`metrics.jsonl 不能超过 ${TIMELAPSE_MAX_METRICS_LINES} 行。`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // 坏行跳过，不让单行脏数据毁掉整份战报。
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const point = cleanLine(parsed as Record<string, unknown>);
    if (!point) continue;
    byIndex.set(point.t, point);
    maxElapsed = Math.max(maxElapsed, point.elapsed_sec);
  }

  const cleaned = Array.from(byIndex.values()).sort((left, right) => left.t - right.t);
  const sampled = downsampleMetricPoints(cleaned, maxPoints);
  const points = trimMetricPointsToByteLimit(sampled, maxBytes);
  return {
    points,
    highlights: computeMetricHighlights(points),
    durationSeconds: Math.min(86_400, Math.max(0, Math.round(maxElapsed))),
    cleanedPointCount: cleaned.length,
  };
}
