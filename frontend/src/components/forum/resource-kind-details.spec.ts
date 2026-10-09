import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Resource } from '@/types';
import ResourceKindDetails from './resource-kind-details';

jest.mock('@/lib/api/client', () => ({
  resourceApi: {
    getMindustryContentMetadata: jest.fn().mockResolvedValue({
      items: { copper: { name: '铜矿', icon: null } },
      blocks: { 'ore-wall': { name: '墙面矿石', icon: null } },
      liquids: { water: { name: '水', icon: null } },
    }),
  },
}));

// The component only reads `t`, so a deterministic stub keeps the assertions
// about the analysis data instead of the locale catalogs.
jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh-CN',
    t: (key: string, values?: Record<string, string | number>) => values
      ? `${key}(${Object.values(values).join(',')})`
      : key,
  }),
}));

type TestDom = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => TestDom;
};

let dom: TestDom;
let container: HTMLDivElement;
let root: Root | null = null;
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
const GLOBALS = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];

function baseResource(renderer: Record<string, unknown>): Resource {
  return {
    id: 1, user_id: 1, title: 'Test resource', description: null, resource_type: 'upload',
    resource_kind: 'map', file_name: 'arena.msav', file_path: null, file_size: 1000,
    mime_type: null, external_url: null, version: '1.0', content: null, content_html: null,
    category_id: null, category_name: null, category_icon: null, download_count: 0,
    is_public: true, status: 'approved', use_mfl: false, mfl_download_url: null,
    username: 'tester', avatar_url: null, created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    metadata: {
      cover_image_url: null, gallery_images: [], tags: [], supported_versions: [], compatibility: [],
      planets: [], game_modes: [], required_mods: [], changelog: null,
    },
    renderer_status: 'ready', renderer_metadata: renderer,
  } as Resource;
}

async function mount(resource: Resource): Promise<void> {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ResourceKindDetails, { resource }));
  });
  // Let the content-metadata promise resolve into the icon/name catalog.
  await act(async () => { await Promise.resolve(); });
}

describe('ResourceKindDetails analysis sections', () => {
  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
    for (const name of GLOBALS) originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: dom.window },
      document: { configurable: true, value: dom.window.document },
      navigator: { configurable: true, value: dom.window.navigator },
      HTMLElement: { configurable: true, value: dom.window.HTMLElement },
      Node: { configurable: true, value: dom.window.Node },
      Event: { configurable: true, value: dom.window.Event },
      MouseEvent: { configurable: true, value: dom.window.MouseEvent },
      IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
    });
    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = null;
  });

  afterAll(() => {
    dom.window.close();
    for (const name of GLOBALS) {
      const descriptor = originalGlobals.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  it('renders map waves and resolves deposit names through the content catalog', async () => {
    await mount(baseResource({
      width: 64, height: 48, waves: true,
      tile_layers: {
        resources: [{ x: 1, y: 1, name: 'copper' }, { x: 2, y: 1, name: 'copper' }],
        liquid: [{ x: 3, y: 3, name: 'water' }],
      },
      wave_groups: [{ begin: 1, end: 5, spacing: 2, amount: 3, unit_health: 100, flying: false }],
    }));

    const text = container.textContent || '';
    expect(text).toContain('resourceKindDetails.mapResources');
    expect(text).toContain('resourceKindDetails.mapTileCount(2)');
    expect(text).toContain('resourceKindDetails.mapResourcesNote');
    // The deposit id resolved to its localized name and picked the right type.
    expect(text).toContain('铜矿');
    expect(text).toContain('resourceKindDetails.resourceTypeItem');
    expect(text).toContain('水');
    expect(text).toContain('resourceKindDetails.resourceTypeLiquid');
    expect(text).toContain('resourceKindDetails.mapWaves');
    expect(text).toContain('resourceKindDetails.mapWaveRange(1,5)');
    expect(text).toContain('resourceKindDetails.mapWaveEnemies(9)');
  });

  it('shows the schematic build-time estimate instead of the unavailable copy', async () => {
    await mount({ ...baseResource({ width: 12, height: 8, estimated_build_time_seconds: 187.4, block_count: 4 }), resource_kind: 'schematic', file_name: 'build.msch' });

    const text = container.textContent || '';
    expect(text).toContain('resourceKindDetails.estimatedBuildTime');
    // 187.4s rounds up to 188s before the minute split: 3m08s.
    expect(text).toContain('resourceKindDetails.estimateAbout(3,8)');
    expect(text).not.toContain('resourceKindDetails.estimateUnavailable');
  });

  it('renders production rates and keeps the unavailable copy for old blueprints', async () => {
    await mount({
      ...baseResource({
        width: 12, height: 8,
        production: {
          mode: 'theoretical', complete: true, available: true,
          items: { inputs: [{ id: 'coal', rate: 12 }], outputs: [{ id: 'graphite', rate: 6 }], internal: [] },
          liquids: { inputs: [], outputs: [], internal: [] },
          power: { generated: 20, consumed: 30, net: -10 },
          warnings: [],
        },
      }),
      resource_kind: 'schematic', file_name: 'build.msch',
    });
    const withProduction = container.textContent || '';
    expect(withProduction).toContain('resourceKindDetails.production');
    expect(withProduction).toContain('resourceKindDetails.itemInputs');
    expect(withProduction).not.toContain('resourceKindDetails.analysisUnavailable');

    await act(async () => { root?.unmount(); });
    root = null;
    await mount({ ...baseResource({ width: 12, height: 8 }), resource_kind: 'schematic', file_name: 'build.msch' });
    const legacy = container.textContent || '';
    expect(legacy).toContain('resourceKindDetails.analysisUnavailable');
    expect(legacy).toContain('resourceKindDetails.estimateUnavailable');
  });
});
