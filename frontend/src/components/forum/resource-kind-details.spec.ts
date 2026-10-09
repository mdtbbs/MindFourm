import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Resource } from '@/types';
import ResourceKindDetails from './resource-kind-details';

jest.mock('@/lib/api/client', () => ({
  resourceApi: {
    getMindustryContentMetadata: jest.fn().mockResolvedValue({ items: {}, blocks: {}, liquids: {} }),
  },
}));

// Stable test copies: the component reads `t` only, so the real catalog would
// add a dependency on the locale files without testing any of the logic here.
jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    t: (key: string, values?: Record<string, string | number>) => values
      ? `${key}(${Object.values(values).join(',')})`
      : key,
  }),
}));

function mapResource(renderer: Record<string, unknown>): Resource {
  return {
    id: 1, user_id: 1, title: 'Test map', description: null, resource_type: 'upload',
    resource_kind: 'map', file_name: 'arena.msav', file_path: null, file_size: 1000,
    mime_type: null, external_url: null, version: '1.0', content: null, content_html: null,
    category_id: null, category_name: null, category_icon: null, download_count: 0,
    is_public: true, status: 'approved', use_mfl: false, mfl_download_url: null,
    username: 'tester', avatar_url: null, created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z', metadata: { planets: [], game_modes: [], required_mods: [] },
    renderer_status: 'ready', renderer_metadata: renderer,
  } as Resource;
}

function schematicResource(renderer: Record<string, unknown>): Resource {
  return { ...mapResource(renderer), resource_kind: 'schematic', file_name: 'build.msch' };
}

describe('ResourceKindDetails analysis sections', () => {
  it('renders map wave ranges and deposit counts from renderer metadata', () => {
    const html = renderToStaticMarkup(createElement(ResourceKindDetails, {
      resource: mapResource({
        width: 64, height: 48, waves: true,
        tile_layers: { resources: [{ x: 1, y: 1, name: 'copper' }, { x: 2, y: 1, name: 'copper' }] },
        wave_groups: [{ begin: 1, end: 5, spacing: 2, amount: 3, unit_health: 100, flying: false }],
      }),
    }));

    expect(html).toContain('resourceKindDetails.mapResources');
    expect(html).toContain('copper');
    expect(html).toContain('resourceKindDetails.mapTileCount(2)');
    expect(html).toContain('resourceKindDetails.mapWaves');
    expect(html).toContain('resourceKindDetails.mapWaveRange(1,5)');
    expect(html).toContain('resourceKindDetails.mapWaveEnemies(9)');
  });

  it('shows the schematic build-time estimate instead of the unavailable copy', () => {
    const html = renderToStaticMarkup(createElement(ResourceKindDetails, {
      resource: schematicResource({ width: 12, height: 8, estimated_build_time_seconds: 187.4, block_count: 4 }),
    }));

    expect(html).toContain('resourceKindDetails.estimatedBuildTime');
    // 187.4s rounds up to 188s before the minute split: 3m08s.
    expect(html).toContain('resourceKindDetails.estimateAbout(3,8)');
    expect(html).not.toContain('resourceKindDetails.estimateUnavailable');
  });

  it('renders production rates and keeps the unavailable copy for old blueprints', () => {
    const withProduction = renderToStaticMarkup(createElement(ResourceKindDetails, {
      resource: schematicResource({
        width: 12, height: 8,
        production: {
          mode: 'theoretical', complete: true, available: true,
          items: { inputs: [{ id: 'coal', rate: 12 }], outputs: [{ id: 'graphite', rate: 6 }], internal: [] },
          liquids: { inputs: [], outputs: [], internal: [] },
          power: { generated: 20, consumed: 30, net: -10 },
          warnings: [],
        },
      }),
    }));
    expect(withProduction).toContain('resourceKindDetails.production');
    expect(withProduction).toContain('resourceKindDetails.itemInputs');
    expect(withProduction).not.toContain('resourceKindDetails.analysisUnavailable');

    const legacy = renderToStaticMarkup(createElement(ResourceKindDetails, {
      resource: schematicResource({ width: 12, height: 8 }),
    }));
    expect(legacy).toContain('resourceKindDetails.analysisUnavailable');
    expect(legacy).toContain('resourceKindDetails.estimateUnavailable');
  });
});
