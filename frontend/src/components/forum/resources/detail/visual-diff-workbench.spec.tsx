import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  getMapDiffChunk,
  getMapDiffOverlayBlob,
  getResourceVisualDiff,
  type MapVisualDiffData,
  type SchematicVisualDiffData,
  type VisualDiffResponse,
} from '@/lib/api/v1/resource-visual-diff';
import VisualDiffWorkbench from './visual-diff-workbench';

jest.mock('@/lib/api/v1/resource-visual-diff', () => ({
  ...jest.requireActual('@/lib/api/v1/resource-visual-diff'),
  getResourceVisualDiff: jest.fn(),
  getMapDiffChunk: jest.fn(),
  getMapDiffOverlayBlob: jest.fn(),
  getSchematicLogic: jest.fn().mockResolvedValue({ items: [], pagination: { next_cursor: null, has_more: false } }),
}));

// The real English catalog is the assertion vocabulary; it also proves the
// component never hard-codes UI copy of its own.
jest.mock('@/i18n/provider', () => {
  const catalog = require('@/i18n/locales/en/visual-diff.json');
  const read = (key: string): unknown => key.split('.').reduce<unknown>((value, part) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
  ), catalog);
  return {
    useI18n: () => ({
      locale: 'en',
      t: (key: string, values?: Record<string, string | number>) => {
        const message = read(key);
        const text = typeof message === 'string' ? message : key;
        return Object.entries(values ?? {}).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), text);
      },
      setLocale: () => undefined,
    }),
  };
});

const mockDiff = getResourceVisualDiff as jest.MockedFunction<typeof getResourceVisualDiff>;
const mockChunk = getMapDiffChunk as jest.MockedFunction<typeof getMapDiffChunk>;
const mockOverlay = getMapDiffOverlayBlob as jest.MockedFunction<typeof getMapDiffOverlayBlob>;

type TestDom = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => TestDom;
};

const RESOURCE_PUBLIC_ID = '11111111-1111-4111-8111-111111111111';
const OLD_VERSION = '22222222-2222-4222-8222-222222222222';
const NEW_VERSION = '33333333-3333-4333-8333-333333333333';
const GLOBALS = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];

let dom: TestDom;
let container: HTMLDivElement;
let root: Root | null = null;
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

const schematicDiff: SchematicVisualDiffData = {
  schema_version: 2,
  mode: 'full',
  kind: 'schematic',
  offset: { x: 0, y: 0 },
  blocks: {
    added: [
      { x: 1, y: 2, block: 'conveyor', rotation: 0, config_type: 'none' },
      { x: 2, y: 2, block: 'conveyor', rotation: 1, config_type: 'none' },
    ],
    removed: [{ x: 3, y: 4, block: 'router', rotation: 0, config_type: 'none' }],
    modified: [{
      x: 5,
      y: 6,
      block: 'duo',
      before: { rotation: 0, config_type: 'none', config_sha256: 'aa', config_summary: null },
      after: { rotation: 1, config_type: 'point', config_sha256: 'bb', config_summary: { x: 1, y: 1 } },
    }],
    truncated: false,
  },
  materials_delta: [{ item: 'copper', before: 10, after: 18, delta: 8 }],
  power_delta: {
    production: { before: 10, after: 10, delta: 0 },
    consumption: { before: 5, after: 6, delta: 1 },
    net: { before: 5, after: 4, delta: -1 },
    estimated: true,
  },
  logic_diffs: [{
    key: 'processor@1,1',
    status: 'modified',
    before: { x: 1, y: 1, processor_type: 'micro-processor' },
    after: { x: 1, y: 1, processor_type: 'logic-processor' },
    hunks: [{
      header: '@@ -1,2 +1,2 @@',
      lines: [
        { type: ' ', text: 'set x 1', before_line: 1, after_line: 1 },
        { type: '-', text: 'op add a 1 2', before_line: 2 },
        { type: '+', text: 'op mul a 1 2', after_line: 2 },
      ],
    }],
    links: { added: [{ name: 'x', x: 1, y: 1 }], removed: [] },
    truncated: false,
  }],
  logic_truncated: false,
  metadata: {
    width: { before: 10, after: 10 },
    height: { before: 10, after: 10 },
    block_count: { before: 3, after: 4 },
  },
  estimated: true,
};

const mapDiff: MapVisualDiffData = {
  schema_version: 2,
  mode: 'full',
  kind: 'map',
  rules_diff: {
    added: [{ key: 'unitCap', value: 10 }],
    removed: [],
    changed: [{ key: 'waveSpacing', before: 30, after: 20 }],
    banned_blocks: { added: ['router'], removed: [] },
    banned_units: { added: [], removed: ['flare'] },
    loadout: { added: [{ item: 'copper', amount: 100 }], removed: [] },
    unknown_rules_changed: false,
  },
  waves_diff: {
    groups: { added: [], removed: [], changed: [], truncated: false },
    wave_count: { before: 10, after: 12 },
    curve: {
      before: [
        { wave_start: 1, wave_end: 3, estimated_health: 100, strength: 2, boss_count: 0 },
        { wave_start: 4, wave_end: 6, estimated_health: 400, strength: 4, boss_count: 1 },
      ],
      after: [
        { wave_start: 1, wave_end: 3, estimated_health: 150, strength: 3, boss_count: 0 },
        { wave_start: 4, wave_end: 6, estimated_health: 500, strength: 5, boss_count: 1 },
      ],
    },
  },
  objects_diff: {
    counts: {
      cores: { before: 2, after: 3 },
      spawns: { before: 1, after: 2 },
      buildings: { before: 10, after: 12 },
    },
    truncated: false,
  },
  resources_delta: [{ name: 'copper', kind: 'ore', before_tiles: 10, after_tiles: 20, delta: 10 }],
  terrain_chunks_summary: [
    { cx: 0, cy: 0, floor_changed: true, overlay_changed: false },
    { cx: 1, cy: 0, floor_changed: false, overlay_changed: true },
  ],
  chunk_size: 128,
  chunks_truncated: false,
  objects_truncated: false,
  diff_overlay_preview_key: null,
  estimated: true,
};

const versions = [
  { public_id: NEW_VERSION, version: '2.0.0' },
  { public_id: OLD_VERSION, version: '1.0.0' },
];

function response(overrides: Partial<VisualDiffResponse>): VisualDiffResponse {
  return {
    from_version_public_id: OLD_VERSION,
    to_version_public_id: NEW_VERSION,
    status: 'completed',
    parser_version: 'parser-1',
    diff: null,
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 8; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount(kind: 'schematic' | 'map', result: VisualDiffResponse, versionList = versions): Promise<void> {
  mockDiff.mockResolvedValue(result);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(VisualDiffWorkbench, {
      resourcePublicId: RESOURCE_PUBLIC_ID,
      resourceKind: kind,
      toVersionPublicId: versionList[0]?.public_id,
      versions: versionList,
    }));
  });
  await settle();
}

async function clickButtonWithText(text: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === text) ?? null;
  await click(button);
}

async function click(element: Element | null): Promise<void> {
  if (!element) throw new Error('Expected interactive element was not rendered');
  await act(async () => {
    (element as HTMLElement).click();
  });
  await settle();
}

describe('VisualDiffWorkbench', () => {
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
  });

  afterAll(() => {
    for (const name of GLOBALS) {
      const original = originalGlobals.get(name);
      if (original) Object.defineProperty(globalThis, name, original);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    dom.window.close();
  });

  beforeEach(() => {
    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    mockDiff.mockReset();
    mockChunk.mockReset();
    mockOverlay.mockReset();
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = null;
    container.remove();
  });

  it('requests the selected version pair and renders the schematic overlay plus materials', async () => {
    await mount('schematic', response({ diff: schematicDiff as unknown as Record<string, unknown> }));

    expect(mockDiff).toHaveBeenCalledTimes(1);
    const [publicId, kind, options] = mockDiff.mock.calls[0];
    expect(publicId).toBe(RESOURCE_PUBLIC_ID);
    expect(kind).toBe('schematic');
    expect(options).toMatchObject({ toVersionPublicId: NEW_VERSION, fromVersionPublicId: OLD_VERSION });

    // Removed + modified on the left; added (two) + modified on the right.
    expect(container.querySelectorAll('svg[data-diff-pane="from"] rect').length).toBe(2);
    expect(container.querySelectorAll('svg[data-diff-pane="to"] rect').length).toBe(3);
    const blockTitles = Array.from(container.querySelectorAll('svg[data-diff-pane="to"] rect title')).map((title) => title.textContent ?? '');
    expect(blockTitles.some((title) => title.includes('conveyor'))).toBe(true);

    const text = container.textContent ?? '';
    expect(text).toContain('Materials');
    expect(text).toContain('copper');
    expect(text).toContain('Theoretical estimate');
    expect(text).toContain('Logic processors');
  });

  it('expands a logic processor into the aligned mlog diff after a click', async () => {
    await mount('schematic', response({ diff: schematicDiff as unknown as Record<string, unknown> }));

    expect(container.querySelector('[data-testid="mlog-split-diff"]')).toBeNull();
    const logicButton = Array.from(container.querySelectorAll('button[aria-expanded]'))
      .find((button) => button.textContent?.includes('processor@1,1')) ?? null;
    await click(logicButton);

    const table = container.querySelector('[data-testid="mlog-split-diff"]');
    expect(table).not.toBeNull();
    const text = table?.textContent ?? '';
    expect(text).toContain('op add a 1 2');
    expect(text).toContain('op mul a 1 2');
    expect(text).toContain('set x 1');
    expect(table?.querySelectorAll('[data-row-kind="removed"]').length).toBe(1);
    expect(table?.querySelectorAll('[data-row-kind="added"]').length).toBe(1);
  });

  it('renders metadata-only maps as a degraded table without any canvas controls', async () => {
    await mount('map', response({
      status: 'metadata_only',
      from_version_public_id: OLD_VERSION,
      to_version_public_id: NEW_VERSION,
      diff: {
        schema_version: 2,
        mode: 'metadata_only',
        fallback_reason: 'parser-unavailable',
        file_delta: { size_from: 1024, size_to: 2048, sha256_changed: true },
        metadata_delta: { version_from: '1.0.0', version_to: '2.0.0', game_version_bounds_changed: false },
        dependencies_delta: { added: ['mod-a'], removed: [] },
      },
    }));

    const text = container.textContent ?? '';
    expect(text).toContain('Metadata-only comparison');
    expect(text).toContain('parser-unavailable');
    expect(text).toContain('1 KB');
    expect(text).toContain('2 KB');
    expect(text).toContain('mod-a');
    // No map tabs, no preview canvas, no overlay/chunk requests.
    expect(container.querySelector('[role="tab"]')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg[data-diff-pane]')).toBeNull();
    expect(mockChunk).not.toHaveBeenCalled();
    expect(mockOverlay).not.toHaveBeenCalled();
  });

  it('renders map tabs, rules, waves, objects and the chunk heatmap fallback', async () => {
    await mount('map', response({ diff: mapDiff as unknown as Record<string, unknown> }));

    expect(container.querySelectorAll('[role="tab"]').length).toBe(4);
    const text = container.textContent ?? '';
    expect(text).toContain('Changed chunks');
    expect(text).toContain('Cores (before → after)');
    expect(text).toContain('Resource deposits changed');

    await clickButtonWithText('Rules');
    const rulesText = container.textContent ?? '';
    expect(rulesText).toContain('unitCap');
    expect(rulesText).toContain('waveSpacing');
    expect(rulesText).toContain('router');
    expect(rulesText).toContain('flare');

    await clickButtonWithText('Waves');
    const healthChart = container.querySelector('svg[aria-label="Estimated enemy health by wave"]');
    expect(healthChart?.querySelectorAll('polyline').length).toBe(2);
    const strengthChart = container.querySelector('svg[aria-label="Wave strength by wave"]');
    expect(strengthChart?.querySelectorAll('polyline').length).toBe(2);

    await clickButtonWithText('Cores and resources');
    const objectsText = container.textContent ?? '';
    expect(objectsText).toContain('copper');
    expect(objectsText).toContain('Ore');
    expect(objectsText).toContain('(0, 0)');

    await clickButtonWithText('Canvas');
    await clickButtonWithText('Difference heatmap');
    const overlay = container.querySelector('img[alt="Difference overlay for the two map versions"]');
    expect(overlay?.getAttribute('src')).toContain('/api/v1/resources/maps/11111111-1111-4111-8111-111111111111/diff/overlay');
    await act(async () => {
      overlay?.dispatchEvent(new dom.window.Event('error'));
    });
    await settle();
    expect(container.querySelector('[role="img"][aria-label="Changed map chunks"]')).not.toBeNull();
    expect(container.textContent).toContain('The overlay image is unavailable');
  });

  it('shows a lightweight note when the feature is disabled', async () => {
    await mount('map', response({ status: 'disabled', diff: null }));

    expect(container.textContent).toContain('Visual comparison is disabled on this site.');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});
