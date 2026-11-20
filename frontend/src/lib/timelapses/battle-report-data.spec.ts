import {
  BATTLE_REPORT_MAX_METRIC_POINTS,
  areaPolygonPoints,
  battleReportLabel,
  buildSeries,
  formatBattleReportDuration,
  formatCompactNumber,
  isBattleReportPublicId,
  mapSeriesPoint,
  normalizeBattleReportHighlights,
  normalizeBattleReportMetrics,
  normalizeBattleReportPayload,
  polylinePoints,
  safeBattleReportMediaUrl,
  seekSecondsForFraction,
  waveMarkers,
  type TimelapseMetricPoint,
} from './battle-report-data';

const PUBLIC_ID = '123e4567-e89b-42d3-a456-426614174000';

function metric(overrides: Partial<TimelapseMetricPoint> = {}): TimelapseMetricPoint {
  return {
    t: 0,
    elapsed_sec: 0,
    wave: 1,
    power_gen: 0,
    power_use: 0,
    power_stored: 0,
    core_items: 0,
    item_rate_per_min: 0,
    units_ally: 0,
    units_enemy: 0,
    buildings_ally: 0,
    players_online: 0,
    ...overrides,
  };
}

function samplePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: PUBLIC_ID,
    status: 'published',
    visibility: 'public',
    author: { id: 7, username: 'builder', avatar_url: '/api/users/7/avatar' },
    map_name: 'Serpulo',
    map_width: 512,
    map_height: 512,
    game_mode: 'survival',
    game_version: 'v146',
    is_multiplayer: false,
    max_wave: 35,
    duration_seconds: 120,
    frame_count: 180,
    video_url: '/api/v1/timelapses/' + PUBLIC_ID + '/video',
    poster_url: 'https://cdn.example.org/poster.webp',
    metrics: [
      { t: 0, elapsed_sec: 0, wave: 1, power_gen: 1000, power_use: 800, power_stored: 200, core_items: 500, item_rate_per_min: 60, units_ally: 5, units_enemy: 8, buildings_ally: 12, players_online: 1 },
      { t: 1, elapsed_sec: 60, wave: 2, power_gen: 2000, power_use: 1500, power_stored: 300, core_items: 800, item_rate_per_min: 90, units_ally: 9, units_enemy: 14, buildings_ally: 20, players_online: 1 },
    ],
    highlights: {
      peak_power_gen: 2000,
      peak_power_use: 1500,
      peak_power_stored: 300,
      peak_item_rate_per_min: 90,
      max_wave: 35,
      peak_buildings_ally: 20,
      peak_units_ally: 9,
      peak_units_enemy: 14,
    },
    created_at: '2026-11-20T00:00:00.000Z',
    published_at: '2026-11-20T01:00:00.000Z',
    review_reason: null,
    failure_code: null,
    failure_reason: null,
    ...overrides,
  };
}

describe('normalizeBattleReportMetrics', () => {
  it('returns an empty array for non-array input', () => {
    expect(normalizeBattleReportMetrics(null)).toEqual([]);
    expect(normalizeBattleReportMetrics({})).toEqual([]);
    expect(normalizeBattleReportMetrics('nope')).toEqual([]);
  });

  it('drops non-object entries and clamps every value to a finite non-negative number', () => {
    const points = normalizeBattleReportMetrics([
      { t: 3, elapsed_sec: 12, wave: 2, power_gen: 100, power_use: -5, power_stored: Number.NaN, core_items: Infinity, item_rate_per_min: '12', units_ally: 3, units_enemy: 4, buildings_ally: 5, players_online: 6 },
      null,
      'text',
      [],
      { elapsed_sec: -30 },
    ]);
    expect(points).toHaveLength(2);
    // 按 elapsed_sec 升序排列：缺失/负数点归零后排在首位。
    expect(points[0]).toMatchObject({ t: 0, elapsed_sec: 0, wave: 0, power_gen: 0, power_use: 0, core_items: 0 });
    expect(points[1]).toMatchObject({
      t: 3, elapsed_sec: 12, wave: 2, power_gen: 100, power_use: 0, power_stored: 0,
      core_items: 0, item_rate_per_min: 12, units_ally: 3, units_enemy: 4, buildings_ally: 5, players_online: 6,
    });
  });

  it('floors integer fields and sorts by elapsed_sec', () => {
    const points = normalizeBattleReportMetrics([
      { elapsed_sec: 30, wave: 4.9, t: 2.9 },
      { elapsed_sec: 10, wave: 2.2, t: 1.7 },
    ]);
    expect(points.map((point) => point.elapsed_sec)).toEqual([10, 30]);
    expect(points.map((point) => point.wave)).toEqual([2, 4]);
    expect(points.map((point) => point.t)).toEqual([1, 2]);
  });

  it('caps the series at 240 points while keeping the first and last sample', () => {
    const many = Array.from({ length: 500 }, (_, index) => metric({ elapsed_sec: index }));
    const points = normalizeBattleReportMetrics(many);
    expect(points).toHaveLength(BATTLE_REPORT_MAX_METRIC_POINTS);
    expect(points[0].elapsed_sec).toBe(0);
    expect(points[points.length - 1].elapsed_sec).toBe(499);
    expect(points.every((point, index) => index === 0 || point.elapsed_sec > points[index - 1].elapsed_sec)).toBe(true);
  });
});

describe('buildSeries', () => {
  it('maps elapsed_sec to x and the requested metric to y', () => {
    const series = buildSeries([
      metric({ elapsed_sec: 0, power_gen: 5 }),
      metric({ elapsed_sec: 60, power_gen: 15 }),
    ], 'power_gen');
    expect(series).toEqual([{ x: 0, y: 5 }, { x: 60, y: 15 }]);
  });

  it('returns an empty series for empty input and sanitizes a non-finite value', () => {
    expect(buildSeries([], 'units_ally')).toEqual([]);
    expect(buildSeries([metric({ power_gen: Number.NaN })], 'power_gen')).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('polylinePoints', () => {
  it('returns an empty string without drawable data', () => {
    expect(polylinePoints([], 100, 50)).toBe('');
    expect(polylinePoints([{ x: 0, y: 0 }], 0, 50)).toBe('');
    expect(polylinePoints([{ x: Number.NaN, y: 1 }], 100, 50)).toBe('');
  });

  it('centers a single point and inverts the y axis', () => {
    expect(polylinePoints([{ x: 0, y: 0 }], 100, 50)).toBe('50,25');
    expect(polylinePoints([{ x: 0, y: 0 }, { x: 10, y: 10 }], 100, 50)).toBe('0,50 100,0');
  });

  it('uses a shared domain for multi-series charts', () => {
    const domain = { xMin: 0, xMax: 10, yMin: 0, yMax: 20 };
    expect(polylinePoints([{ x: 0, y: 5 }, { x: 10, y: 10 }], 100, 50, domain)).toBe('0,37.5 100,25');
  });

  it('ignores non-finite points but keeps the rest', () => {
    expect(polylinePoints([{ x: Number.NaN, y: 1 }, { x: 0, y: 0 }], 100, 50)).toBe('50,25');
  });
});

describe('areaPolygonPoints and mapSeriesPoint', () => {
  it('closes the area against the chart baseline', () => {
    expect(areaPolygonPoints([], 100, 50)).toBe('');
    expect(areaPolygonPoints([{ x: 0, y: 0 }, { x: 10, y: 10 }], 100, 50)).toBe('0,50 0,50 100,0 100,50');
  });

  it('projects a single point with an explicit domain', () => {
    expect(mapSeriesPoint({ x: 5, y: 5 }, 100, 50, { xMin: 0, xMax: 10, yMin: 0, yMax: 10 })).toEqual({ x: 50, y: 25 });
    expect(mapSeriesPoint({ x: Number.NaN, y: 5 }, 100, 50)).toBeNull();
  });
});

describe('waveMarkers', () => {
  it('returns nothing for empty input', () => {
    expect(waveMarkers([])).toEqual([]);
  });

  it('reports each wave change once with a clamped fraction', () => {
    const points = [
      metric({ elapsed_sec: 0, wave: 1 }),
      metric({ elapsed_sec: 10, wave: 1 }),
      metric({ elapsed_sec: 20, wave: 2 }),
      metric({ elapsed_sec: 30, wave: 2 }),
      metric({ elapsed_sec: 40, wave: 3 }),
    ];
    expect(waveMarkers(points)).toEqual([
      { wave: 1, fraction: 0 },
      { wave: 2, fraction: 0.5 },
      { wave: 3, fraction: 1 },
    ]);
  });

  it('dedupes waves that reappear and honors an explicit duration', () => {
    const points = [
      metric({ elapsed_sec: 10, wave: 1 }),
      metric({ elapsed_sec: 20, wave: 2 }),
      metric({ elapsed_sec: 60, wave: 1 }),
    ];
    expect(waveMarkers(points, 80)).toEqual([
      { wave: 1, fraction: 0.125 },
      { wave: 2, fraction: 0.25 },
    ]);
  });

  it('uses fraction 0 when every sample shares the same timestamp', () => {
    expect(waveMarkers([metric({ elapsed_sec: 0, wave: 4 })])).toEqual([{ wave: 4, fraction: 0 }]);
    expect(waveMarkers([metric({ elapsed_sec: Number.NaN, wave: 4 })])).toEqual([]);
  });
});

describe('formatCompactNumber', () => {
  it('formats small, thousands and millions compactly', () => {
    expect(formatCompactNumber(0)).toBe('0');
    expect(formatCompactNumber(999)).toBe('999');
    expect(formatCompactNumber(1000)).toBe('1k');
    expect(formatCompactNumber(1200)).toBe('1.2k');
    expect(formatCompactNumber(3_400_000)).toBe('3.4M');
    expect(formatCompactNumber(1_100_000_000)).toBe('1.1B');
  });

  it('handles rounding promotion, negatives and non-finite input', () => {
    expect(formatCompactNumber(999_950)).toBe('1M');
    expect(formatCompactNumber(-1500)).toBe('-1.5k');
    expect(formatCompactNumber(Number.NaN)).toBe('0');
    expect(formatCompactNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('seekSecondsForFraction', () => {
  it('maps a fraction onto the duration and clamps the result', () => {
    expect(seekSecondsForFraction(120, 0.5)).toBe(60);
    expect(seekSecondsForFraction(120, -1)).toBe(0);
    expect(seekSecondsForFraction(120, 2)).toBe(120);
    expect(seekSecondsForFraction(100, 1 / 3)).toBe(33.333);
  });

  it('returns 0 for invalid durations and fractions', () => {
    expect(seekSecondsForFraction(0, 0.5)).toBe(0);
    expect(seekSecondsForFraction(Number.NaN, 0.5)).toBe(0);
    expect(seekSecondsForFraction(120, Number.NaN)).toBe(0);
  });
});

describe('formatBattleReportDuration', () => {
  it('formats seconds and hours', () => {
    expect(formatBattleReportDuration(0)).toBe('0:00');
    expect(formatBattleReportDuration(65)).toBe('1:05');
    expect(formatBattleReportDuration(3661)).toBe('1:01:01');
    expect(formatBattleReportDuration(Number.NaN)).toBe('0:00');
  });
});

describe('battleReportLabel and public ids', () => {
  it('matches the server projection wording', () => {
    expect(battleReportLabel('Serpulo', 35)).toBe('基地延时战报: Serpulo · 最高 35 波');
    expect(battleReportLabel('', 0)).toBe('基地延时战报');
    expect(battleReportLabel('Serpulo', 0)).toBe('基地延时战报: Serpulo');
    expect(battleReportLabel('', 35)).toBe('基地延时战报 · 最高 35 波');
    expect(battleReportLabel('[bad]\nname', 1)).toBe('基地延时战报: bad name · 最高 1 波');
  });

  it('accepts only schema v2 UUIDs', () => {
    expect(isBattleReportPublicId(PUBLIC_ID)).toBe(true);
    expect(isBattleReportPublicId(PUBLIC_ID.toUpperCase())).toBe(true);
    expect(isBattleReportPublicId('not-a-uuid')).toBe(false);
    expect(isBattleReportPublicId(null)).toBe(false);
  });
});

describe('safeBattleReportMediaUrl', () => {
  it('accepts same-origin paths and http(s) urls', () => {
    expect(safeBattleReportMediaUrl('/api/v1/timelapses/x/video')).toBe('/api/v1/timelapses/x/video');
    expect(safeBattleReportMediaUrl('https://cdn.example.org/a.mp4')).toBe('https://cdn.example.org/a.mp4');
  });

  it('rejects protocol tricks, traversal and non-strings', () => {
    expect(safeBattleReportMediaUrl('javascript:alert(1)')).toBeNull();
    expect(safeBattleReportMediaUrl('//evil.example/video.mp4')).toBeNull();
    expect(safeBattleReportMediaUrl('/api/../secret')).toBeNull();
    expect(safeBattleReportMediaUrl('data:video/mp4;base64,AAAA')).toBeNull();
    expect(safeBattleReportMediaUrl(null)).toBeNull();
  });
});

describe('normalizeBattleReportHighlights', () => {
  it('turns every field into a finite non-negative number', () => {
    expect(normalizeBattleReportHighlights({ peak_power_gen: 1200, peak_power_use: -1, max_wave: 35.9 })).toMatchObject({
      peakPowerGen: 1200,
      peakPowerUse: 0,
      maxWave: 35,
      peakBuildingsAlly: 0,
    });
    expect(normalizeBattleReportHighlights(null)).toEqual({
      peakPowerGen: 0, peakPowerUse: 0, peakPowerStored: 0, peakItemRatePerMin: 0,
      maxWave: 0, peakBuildingsAlly: 0, peakUnitsAlly: 0, peakUnitsEnemy: 0,
    });
  });
});

describe('normalizeBattleReportPayload', () => {
  it('maps the public DTO onto the card model', () => {
    const report = normalizeBattleReportPayload(samplePayload());
    expect(report).not.toBeNull();
    expect(report).toMatchObject({
      id: PUBLIC_ID,
      status: 'published',
      visibility: 'public',
      mapName: 'Serpulo',
      maxWave: 35,
      durationSeconds: 120,
      frameCount: 180,
      videoUrl: '/api/v1/timelapses/' + PUBLIC_ID + '/video',
      posterUrl: 'https://cdn.example.org/poster.webp',
      author: { id: 7, username: 'builder', avatarUrl: '/api/users/7/avatar' },
    });
    expect(report?.metrics).toHaveLength(2);
    expect(report?.highlights.peakPowerGen).toBe(2000);
  });

  it('fails closed for malformed identity or an unknown status', () => {
    expect(normalizeBattleReportPayload(null)).toBeNull();
    expect(normalizeBattleReportPayload(samplePayload({ id: 'not-a-uuid' }))).toBeNull();
    expect(normalizeBattleReportPayload(samplePayload({ status: 'published ' }))).toBeNull();
  });

  it('drops unsafe media urls and caps free text', () => {
    const report = normalizeBattleReportPayload(samplePayload({
      video_url: 'javascript:alert(1)',
      poster_url: '//evil.example/poster.webp',
      map_name: 'x'.repeat(500),
      author: { id: '7', username: '', avatar_url: 'javascript:alert(1)' },
    }));
    expect(report?.videoUrl).toBeNull();
    expect(report?.posterUrl).toBeNull();
    expect(report?.mapName).toHaveLength(160);
    expect(report?.author).toEqual({ id: 7, username: '匿名用户', avatarUrl: null });
  });
});
