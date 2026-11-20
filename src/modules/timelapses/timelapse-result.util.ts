import {
  TIMELAPSE_MAX_METRICS_POINTS, TIMELAPSE_MAX_SUMMARY_BYTES,
  type TimelapseHighlights, type TimelapseMetricPoint,
} from './timelapse.constants';

const METRIC_KEYS: Array<keyof TimelapseMetricPoint> = [
  't', 'elapsed_sec', 'wave', 'power_gen', 'power_use', 'power_stored', 'core_items',
  'item_rate_per_min', 'units_ally', 'units_enemy', 'buildings_ally', 'players_online',
];

const MAX_VALUE = 1_000_000_000_000;

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(MAX_VALUE, Math.max(0, number)) : fallback;
}

/** 控制面不信任 Worker 回写：再次清洗点位、数量与 JSON 体积。 */
export function sanitizeTimelapseMetrics(value: unknown): TimelapseMetricPoint[] {
  if (!Array.isArray(value)) return [];
  const points: TimelapseMetricPoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const point = {} as TimelapseMetricPoint;
    for (const key of METRIC_KEYS) {
      if (key === 't') point.t = Math.round(finite(record.t));
      else if (key === 'wave') point.wave = Math.min(1_000_000, Math.round(finite(record.wave)));
      else point[key] = finite(record[key]);
    }
    points.push(point);
    if (points.length >= TIMELAPSE_MAX_METRICS_POINTS) break;
  }
  // JSON 体积上限：即使 120 个点也超限（理论上不会），逐步减半直到满足。
  let result = points;
  while (result.length > 1 && Buffer.byteLength(JSON.stringify(result), 'utf8') > TIMELAPSE_MAX_SUMMARY_BYTES) {
    result = result.filter((_, index) => index % 2 === 0 || index === result.length - 1);
  }
  return result;
}

export function computeTimelapseHighlights(points: TimelapseMetricPoint[]): TimelapseHighlights {
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

/** Worker 可提供 highlights，但数值必须与清洗后的点位一致（以点位为准）。 */
export function sanitizeTimelapseHighlights(value: unknown, points: TimelapseMetricPoint[]): TimelapseHighlights {
  const computed = computeTimelapseHighlights(points);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return computed;
  const source = value as Record<string, unknown>;
  const result = { ...computed };
  for (const key of Object.keys(computed) as Array<keyof TimelapseHighlights>) {
    if (source[key] === undefined) continue;
    // 点位采样可能漏掉峰值（波次间隔、最后一个采样点之后的高点），因此取两者较大值；
    // Worker 经签名回写、本身是受信边界，数值仍统一 clamp 到非负有限范围。
    result[key] = Math.max(computed[key], Math.round(finite(source[key])));
  }
  return result;
}

export function sanitizeFailureCode(value: unknown): string {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'TIMELAPSE_RENDER_FAILED';
}

export function sanitizeFailureReason(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 255) || '渲染失败';
}
