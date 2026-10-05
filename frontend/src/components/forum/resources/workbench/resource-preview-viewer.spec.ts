import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResourcePreviewViewer from './resource-preview-viewer';
import { getPreviewMarkers, mapCorePosition, mapTilePosition, schematicBlockLayer, schematicBlockPosition } from './resource-preview-geometry';
import { normalizeResourcePreviewWaves } from './resource-preview-viewer';

describe('resource preview geometry', () => {
  it('projects schematic block tiles using the renderer preview border', () => {
    expect(schematicBlockPosition(0, 0, 10, 8)).toEqual({
      label: '0, 0',
      xPercent: 12.5,
      yPercent: 85,
      layer: 'other',
    });
    expect(schematicBlockLayer('liquid-conduit')).toBe('liquid');
    expect(schematicBlockLayer('power-node')).toBe('power');
    expect(schematicBlockLayer('item-source')).toBe('input_output');
    expect(schematicBlockLayer('titanium-conveyor')).toBe('logistics');
  });

  it('projects map core coordinates and ignores absent coordinate metadata', () => {
    expect(mapCorePosition(3, 2, 10, 6, 'sharded')).toEqual({
      label: 'sharded (3, 2)',
      xPercent: 30,
      yPercent: (4 / 6) * 100,
      layer: 'cores',
    });
    expect(getPreviewMarkers('map', { map: { cores: [{ team: 'sharded' }] } }, 10, 6)).toEqual([]);
  });

  it('reads markers only from public coordinate metadata', () => {
    expect(getPreviewMarkers('map', { map: { cores: [{ x: 3, y: 2, team: 'sharded' }] } }, 10, 6)).toEqual([
      { label: 'sharded (3, 2)', xPercent: 30, yPercent: (4 / 6) * 100, layer: 'cores' },
    ]);
  });

  it('projects only renderer supplied tile layer positions onto the map preview', () => {
    expect(mapTilePosition(2, 3, 10, 6, 'sand', 'terrain')).toEqual({
      label: 'sand (2, 3)', xPercent: 20, yPercent: 50, layer: 'terrain',
    });
    expect(getPreviewMarkers('map', { map: { tile_layers: {
      terrain: [{ x: 2, y: 3, name: 'sand' }], enemy_spawns: [{ x: 7, y: 4 }],
    } } }, 10, 6)).toEqual([
      { label: 'sand (2, 3)', xPercent: 20, yPercent: 50, layer: 'terrain' },
      { label: 'enemy_spawns (7, 4)', xPercent: 70, yPercent: (2 / 6) * 100, layer: 'enemy_spawns' },
    ]);
  });

  it('normalizes bounded wave summaries and keeps unavailable estimates null', () => {
    expect(normalizeResourcePreviewWaves([
      { wave_start: 4, wave_end: 8, enemy_count: 12, estimated_health: null, air_ratio: 1.2, boss_count: 2, strength: 12, is_spike: true },
      { wave_start: 9, wave_end: 8, enemy_count: 1 },
    ])).toEqual([{
      wave_start: 4, wave_end: 8, enemy_count: 12, estimated_health: null,
      air_ratio: 1, boss_count: 2, strength: 12, is_spike: true,
    }]);
  });

  it('derives clearly estimated wave values from renderer unit metadata as a fallback', () => {
    expect(normalizeResourcePreviewWaves([{ begin: 4, end: 8, spacing: 2, amount: 3, unit_health: 100, shields: 10, flying: true, boss: true }])).toEqual([{
      wave_start: 4, wave_end: 8, enemy_count: 9, estimated_health: 990,
      air_ratio: 1, boss_count: 9, strength: 9, is_spike: false,
    }]);
    expect(normalizeResourcePreviewWaves([{ begin: 5, end: 2_147_483_647, amount: 1 }])[0].wave_end).toBeNull();
  });
});

describe('ResourcePreviewViewer', () => {
  it('renders zoom, layer and coordinate controls for a static preview', () => {
    const markup = renderToStaticMarkup(createElement(ResourcePreviewViewer, {
      title: 'Map preview',
      kind: 'map',
      imageUrl: '/preview.png',
      status: 'ready',
      metadata: { map: { cores: [{ x: 3, y: 2, team: 'sharded' }], tile_layers: { terrain: [{ x: 4, y: 3, name: 'sand' }] }, tile_layers_truncated: true } },
      width: 20,
      height: 12,
      labels: {
        zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset', coordinates: 'Coordinates',
        approximate: 'Approximate', grid: 'Grid', markers: 'Markers', noMarkers: 'No coordinate data',
        noPreview: 'No preview', inspect: 'Inspect', selected: 'Selected', layersTitle: 'Preview layers',
        layersNote: 'Classified by name', layersTruncated: 'Some map layers are truncated',
        layers: { logistics: 'Logistics', liquid: 'Liquid', power: 'Power', input_output: 'Input / output', terrain: 'Terrain', resources: 'Resources', ores: 'Ores', cores: 'Cores', enemy_spawns: 'Enemy spawns', buildings: 'Buildings', player_area: 'Player area' },
        wave: { title: 'Wave viewer', chart: 'Wave strength', range: 'Range', enemies: 'Enemies', health: 'Health', airRatio: 'Air ratio', bosses: 'Bosses', strength: 'Strength', spike: 'Spike', openEnded: 'ongoing', estimated: 'Estimated', empty: 'No wave data', unknown: 'Unknown' },
        status: { ready: 'Ready' },
      },
      waveData: [{ wave_start: 1, wave_end: 2, enemy_count: 6, estimated_health: 100, air_ratio: 0.5, boss_count: 1, strength: 6, is_spike: true }],
    }));

    expect(markup).toContain('Map preview');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('Grid');
    expect(markup).toContain('20 × 12 · Approximate');
    expect(markup).toContain('Wave viewer');
    expect(markup).toContain('Wave strength');
    expect(markup).toContain('Bosses: 1');
    expect(markup).toContain('Preview layers');
    expect(markup).toContain('Terrain');
    expect(markup).toContain('Some map layers are truncated');
  });
});
