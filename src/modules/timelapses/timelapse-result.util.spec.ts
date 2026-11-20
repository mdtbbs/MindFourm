import {
  computeTimelapseHighlights, sanitizeFailureCode, sanitizeFailureReason,
  sanitizeTimelapseHighlights, sanitizeTimelapseMetrics,
} from './timelapse-result.util';
import { TIMELAPSE_MAX_METRICS_POINTS } from './timelapse.constants';

function point(overrides: Record<string, unknown> = {}) {
  return {
    t: 0, elapsed_sec: 0, wave: 0, power_gen: 0, power_use: 0, power_stored: 0,
    core_items: 0, item_rate_per_min: 0, units_ally: 0, units_enemy: 0,
    buildings_ally: 0, players_online: 0, ...overrides,
  };
}

describe('timelapse result sanitization', () => {
  it('caps points at 120 and clamps negative/NaN values', () => {
    const input = Array.from({ length: 300 }, (_, index) => point({ t: index, power_gen: index % 2 ? -5 : Number.NaN, wave: index }));
    const result = sanitizeTimelapseMetrics(input);
    expect(result).toHaveLength(TIMELAPSE_MAX_METRICS_POINTS);
    expect(result.every((item) => item.power_gen === 0)).toBe(true);
    expect(result[0].wave).toBe(0);
  });

  it('drops unknown fields and non-object entries', () => {
    const result = sanitizeTimelapseMetrics([{ ...point({ t: 3 }), evil: 'x' }, null, 'x', 4]);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('evil');
  });

  it('computes highlights from points and refuses inflated worker values', () => {
    const points = sanitizeTimelapseMetrics([
      point({ wave: 12, power_gen: 500, item_rate_per_min: 30, buildings_ally: 80 }),
      point({ wave: 20, power_gen: 900, units_enemy: 40 }),
    ]);
    expect(computeTimelapseHighlights(points)).toMatchObject({ max_wave: 20, peak_power_gen: 900, peak_buildings_ally: 80, peak_units_enemy: 40 });
    const sanitized = sanitizeTimelapseHighlights({ max_wave: 999, peak_power_gen: 100, peak_units_enemy: 10 }, points);
    expect(sanitized.max_wave).toBe(999);
    expect(sanitized.peak_power_gen).toBe(900);
    expect(sanitized.peak_units_enemy).toBe(40);
  });

  it('normalizes failure codes and reasons', () => {
    expect(sanitizeFailureCode('ffmpeg_timeout')).toBe('FFMPEG_TIMEOUT');
    expect(sanitizeFailureCode('bad code!')).toBe('TIMELAPSE_RENDER_FAILED');
    expect(sanitizeFailureReason('  boom\u0000\n')).toBe('boom');
  });
});
