import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResourcePreviewViewer from './resource-preview-viewer';
import { getPreviewMarkers, mapCorePosition, schematicBlockPosition } from './resource-preview-geometry';

describe('resource preview geometry', () => {
  it('projects schematic block tiles using the renderer preview border', () => {
    expect(schematicBlockPosition(0, 0, 10, 8)).toEqual({
      label: '0, 0',
      xPercent: 12.5,
      yPercent: 85,
    });
  });

  it('projects map core coordinates and ignores absent coordinate metadata', () => {
    expect(mapCorePosition(3, 2, 10, 6, 'sharded')).toEqual({
      label: 'sharded (3, 2)',
      xPercent: 30,
      yPercent: (4 / 6) * 100,
    });
    expect(getPreviewMarkers('map', { map: { cores: [{ team: 'sharded' }] } }, 10, 6)).toEqual([]);
  });

  it('reads markers only from public coordinate metadata', () => {
    expect(getPreviewMarkers('map', { map: { cores: [{ x: 3, y: 2, team: 'sharded' }] } }, 10, 6)).toEqual([
      { label: 'sharded (3, 2)', xPercent: 30, yPercent: (4 / 6) * 100 },
    ]);
  });
});

describe('ResourcePreviewViewer', () => {
  it('renders zoom, layer and coordinate controls for a static preview', () => {
    const markup = renderToStaticMarkup(createElement(ResourcePreviewViewer, {
      title: 'Map preview',
      kind: 'map',
      imageUrl: '/preview.png',
      status: 'ready',
      metadata: { map: { cores: [] } },
      width: 20,
      height: 12,
      labels: {
        zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset', coordinates: 'Coordinates',
        approximate: 'Approximate', grid: 'Grid', markers: 'Markers', noMarkers: 'No coordinate data',
        noPreview: 'No preview', status: { ready: 'Ready' },
      },
    }));

    expect(markup).toContain('Map preview');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('Grid');
    expect(markup).toContain('20 × 12 · Approximate');
  });
});
