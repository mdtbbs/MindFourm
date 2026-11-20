/** metrics.jsonl 清洗、去重、降采样、60 KB 上限与 highlights 测试。 */

import { TimelapseArchiveError } from './errors';
import {
  computeMetricHighlights,
  downsampleMetricPoints,
  parseMetricsJsonl,
  trimMetricPointsToByteLimit,
} from './metrics';
import type { TimelapseMetricPoint } from '../../modules/timelapses/timelapse.constants';

function line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    idx: 0,
    elapsed_sec: 0,
    wave: 1,
    power_gen: 100,
    power_use: 80,
    power_stored: 20,
    core_items: 300,
    item_rate_per_min: 12,
    units_ally: 3,
    units_enemy: 4,
    buildings_ally: 5,
    players_online: 1,
    ...overrides,
  });
}

function jsonl(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

function point(index: number, overrides: Partial<TimelapseMetricPoint> = {}): TimelapseMetricPoint {
  return {
    t: index,
    elapsed_sec: index,
    wave: 1,
    power_gen: 100,
    power_use: 80,
    power_stored: 20,
    core_items: 300,
    item_rate_per_min: 12,
    units_ally: 3,
    units_enemy: 4,
    buildings_ally: 5,
    players_online: 1,
    ...overrides,
  };
}

describe('parseMetricsJsonl', () => {
  it('丢弃未知字段并把 idx 映射为 t', () => {
    const summary = parseMetricsJsonl(jsonl([line({ idx: 3, evil: 'x', name: 'secret' })]));
    expect(summary.points).toHaveLength(1);
    expect(summary.points[0]).toMatchObject({ t: 3, elapsed_sec: 0, wave: 1, power_gen: 100 });
    expect(summary.points[0]).not.toHaveProperty('evil');
    expect(summary.points[0]).not.toHaveProperty('idx');
  });

  it('数值 clamp 到 [0, 1e12]，非有限值记 0，wave 取整', () => {
    const summary = parseMetricsJsonl(jsonl([line({
      idx: 0,
      power_gen: -5,
      power_use: Number.NaN,
      power_stored: 1e15,
      core_items: Infinity,
      item_rate_per_min: '42.5',
      wave: 7.8,
      players_online: -1,
    })]));
    expect(summary.points[0]).toMatchObject({
      power_gen: 0,
      power_use: 0,
      power_stored: 1_000_000_000_000,
      core_items: 0,
      item_rate_per_min: 42.5,
      wave: 8,
      players_online: 0,
    });
  });

  it('按 idx 去重（保留最后一条）并升序排序', () => {
    const summary = parseMetricsJsonl(jsonl([
      line({ idx: 5, wave: 2 }),
      line({ idx: 1, wave: 9 }),
      line({ idx: 5, wave: 20 }),
      line({ idx: 2, wave: 4 }),
    ]));
    expect(summary.points.map((item) => item.t)).toEqual([1, 2, 5]);
    expect(summary.points.find((item) => item.t === 5)?.wave).toBe(20);
  });

  it('跳过坏 JSON、非对象行与非法 idx', () => {
    const summary = parseMetricsJsonl(jsonl([
      'not json',
      '[]',
      '"x"',
      line({ idx: -1 }),
      line({ idx: 1.5 }),
      line({ idx: undefined }),
      line({ idx: 7 }),
    ]));
    expect(summary.points.map((item) => item.t)).toEqual([7]);
  });

  it('空文件返回空摘要', () => {
    expect(parseMetricsJsonl(Buffer.alloc(0))).toEqual({
      points: [],
      highlights: computeMetricHighlights([]),
      durationSeconds: 0,
      cleanedPointCount: 0,
    });
  });

  it('超过 1000 行或单行 4 KB 时拒绝', () => {
    expect(() => parseMetricsJsonl(jsonl(Array.from({ length: 1001 }, (_, index) => line({ idx: index })))))
      .toThrow(TimelapseArchiveError);
    try {
      parseMetricsJsonl(jsonl([JSON.stringify({ idx: 0, padding: 'x'.repeat(5000) })]));
    } catch (error) {
      expect((error as TimelapseArchiveError).code).toBe('TIMELAPSE_METRICS_INVALID');
    }
  });

  it('均匀降采样到 120 点并保留首尾', () => {
    const summary = parseMetricsJsonl(jsonl(Array.from({ length: 300 }, (_, index) => line({ idx: index, elapsed_sec: index }))));
    expect(summary.points).toHaveLength(120);
    expect(summary.points[0].t).toBe(0);
    expect(summary.points[summary.points.length - 1].t).toBe(299);
    expect(summary.cleanedPointCount).toBe(300);
  });

  it('计算 highlights（峰值为最终点位最大值）', () => {
    const summary = parseMetricsJsonl(jsonl([
      line({ idx: 0, elapsed_sec: 0, wave: 3, power_gen: 1000, power_use: 500, power_stored: 200, item_rate_per_min: 30, buildings_ally: 9, units_ally: 4, units_enemy: 8 }),
      line({ idx: 1, elapsed_sec: 24, wave: 20, power_gen: 900, power_use: 800, power_stored: 300, item_rate_per_min: 45, buildings_ally: 15, units_ally: 7, units_enemy: 25 }),
    ]));
    expect(summary.highlights).toEqual({
      peak_power_gen: 1000,
      peak_power_use: 800,
      peak_power_stored: 300,
      peak_item_rate_per_min: 45,
      max_wave: 20,
      peak_buildings_ally: 15,
      peak_units_ally: 7,
      peak_units_enemy: 25,
    });
    expect(summary.durationSeconds).toBe(24);
  });

  it('序列化后仍超 60 KB 时继续减半并保留末点', () => {
    const points = Array.from({ length: 120 }, (_, index) => point(index, { power_gen: 1e12 - index - 0.123456789 }));
    const serialized = Buffer.byteLength(JSON.stringify(points), 'utf8');
    expect(serialized).toBeGreaterThan(0);
    const trimmed = trimMetricPointsToByteLimit(points, Math.floor(serialized / 3));
    expect(trimmed.length).toBeLessThan(points.length);
    expect(trimmed[0]).toEqual(points[0]);
    expect(trimmed[trimmed.length - 1]).toEqual(points[points.length - 1]);
    expect(Buffer.byteLength(JSON.stringify(trimmed), 'utf8')).toBeLessThanOrEqual(Math.floor(serialized / 3));
  });

  it('默认摘要序列化不超过 60 KB', () => {
    const summary = parseMetricsJsonl(jsonl(Array.from({ length: 180 }, (_, index) => line({ idx: index, elapsed_sec: index }))));
    expect(Buffer.byteLength(JSON.stringify(summary.points), 'utf8')).toBeLessThanOrEqual(60 * 1024);
  });

  it('downsampleMetricPoints 对不足上限的输入原样返回', () => {
    const points = [point(0), point(1), point(2)];
    expect(downsampleMetricPoints(points, 120)).toBe(points);
    expect(downsampleMetricPoints(points, 1)).toEqual([points[0]]);
  });
});
