import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getResourceV2VersionDiff, type ResourceV2VersionDiff } from '@/lib/api/v1/resources';
import ResourceVersionChangeSummary, { type VersionChangeCache } from './resource-version-change-summary';

jest.mock('@/lib/api/v1/resources', () => ({
  ...jest.requireActual('@/lib/api/v1/resources'),
  getResourceV2VersionDiff: jest.fn(),
}));

jest.mock('@/i18n/provider', () => {
  // English labels double as the assertion vocabulary; the four catalogs are
  // guarded separately by tests/frontend-i18n.spec.ts and the catalog parity test.
  const labels: Record<string, string> = {
    'resourceChangeSummary.title': 'Version change summary',
    'resourceChangeSummary.loading': 'Loading the version change summary…',
    'resourceChangeSummary.loadFailed': 'Could not load the version change summary.',
    'resourceChangeSummary.retry': 'Retry',
    'resourceChangeSummary.range': '{to} compared with {from}',
    'resourceChangeSummary.firstVersion': 'This is the first public version of this resource, so there is nothing earlier to compare it with.',
    'resourceChangeSummary.unavailable': "No structured change summary is available for this version. The author's release notes are shown below.",
    'resourceChangeSummary.noChanges': 'No structured differences were found.',
    'resourceChangeSummary.items': '{count} items',
    'resourceChangeSummary.more': '{count} more items are not shown.',
    'resourceChangeSummary.estimated': 'Theoretical estimate',
    'resourceChangeSummary.estimateNote': 'Values marked as theoretical estimates come from structured parsing and are not a precise game simulation.',
    'resourceChangeSummary.mapDisclaimer': 'Generated from structured parse data; it is not a tile-by-tile map diff.',
    'resourceChangeSummary.unknownValue': 'Not provided',
    'resourceChangeSummary.statusAdded': 'Added',
    'resourceChangeSummary.statusRemoved': 'Removed',
    'resourceChangeSummary.statusChanged': 'Changed',
    'resourceChangeSummary.statusRenamed': 'Renamed',
  };
  const groups: Record<string, string> = {
    metadata: 'Basic data', contentBlock: 'Blocks', contentItem: 'Items', contentLiquid: 'Liquids',
    contentUnit: 'Units', contentPlanet: 'Planets', contentTechNode: 'Tech', contentOther: 'Other content',
    blocks: 'Blocks', materials: 'Materials', production: 'Production and power', resources: 'Resource deposits',
    cores: 'Cores', spawns: 'Spawns', waves: 'Waves',
  };
  const fields: Record<string, string> = {
    width: 'Width', height: 'Height', blockCount: 'Block count', gameMode: 'Game mode', planet: 'Planet',
    playerCount: 'Player count', playtimeSeconds: 'Playtime', count: 'Count', enemyCount: 'estimated enemies',
    bossCount: 'bosses', powerDelta: 'Net power change', logicProcessors: 'Logic processors',
    throughputChanged: 'Throughput figures changed', rulesChanged: 'Map rules changed; individual rules are not listed.',
  };
  for (const [key, value] of Object.entries(groups)) labels[`resourceChangeSummary.groups.${key}`] = value;
  for (const [key, value] of Object.entries(fields)) labels[`resourceChangeSummary.fields.${key}`] = value;
  return {
    useI18n: () => ({
      locale: 'en',
      t: (key: string, values?: Record<string, string | number>) => (labels[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? '')),
      setLocale: () => undefined,
    }),
  };
});

const mockDiff = getResourceV2VersionDiff as jest.MockedFunction<typeof getResourceV2VersionDiff>;
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

function diffResult(overrides: Partial<ResourceV2VersionDiff> = {}): ResourceV2VersionDiff {
  return {
    from_version_public_id: OLD_VERSION,
    to_version_public_id: NEW_VERSION,
    status: 'completed',
    parser_version: 'diff-parser-1',
    diff: null,
    ...overrides,
  };
}

async function mount(cache: VersionChangeCache, props: Partial<{ resourceKind: string; toVersionPublicId: string; versions: Array<{ public_id: string; version: string }> }> = {}): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ResourceVersionChangeSummary, {
      resourcePublicId: RESOURCE_PUBLIC_ID,
      resourceKind: props.resourceKind ?? 'mod',
      toVersionPublicId: props.toVersionPublicId ?? NEW_VERSION,
      versions: props.versions ?? [
        { public_id: OLD_VERSION, version: '1.0.0' },
        { public_id: NEW_VERSION, version: '1.1.0' },
      ],
      cache,
    }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(element: Element | null): Promise<void> {
  if (!element) throw new Error('Expected interactive element was not rendered');
  await act(async () => {
    (element as HTMLElement).click();
  });
}

/** The stored payload really does carry these; the UI has to drop all of them. */
const FORBIDDEN_FIELDS = {
  dependencies: [{ status: 'added', kind: 'required', mod_id: 'leaked-dependency' }],
  compatibility: [{ runtime: 'desktop', status: 'partial', notes: 'leaked compatibility note' }],
  files: [{ status: 'added', name: 'leaked.jar', before_sha256: null, after_sha256: 'deadbeef' }],
  game_version: { before_min: 'v6', before_max: 'v7', after_min: 'v7', after_max: 'v8' },
  min_supported_build: 100,
  game_version_min: 'v6',
  game_version_max: 'v8',
  manifest: [{ field: 'displayName', before: 'Leaked manifest name', after: null }],
  content_hash: 'leaked-content-hash',
  structure_hash: 'leaked-structure-hash',
  analysis: { before: { estimated_difficulty: 12 }, after: { estimated_difficulty: 40 }, estimated: true },
  rules_json: '{"leakedRule":true}',
  unknown_private_field: 'leaked-unknown-value',
  download_key: 'leaked-download-key',
  file_path: '/srv/leaked/path.jar',
};

describe('ResourceVersionChangeSummary', () => {
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
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = null;
    container.remove();
  });

  it('requests the selected target version on the kind-specific endpoint', async () => {
    mockDiff.mockResolvedValue(diffResult({ diff: { content: [] } }));
    await mount(new Map(), { resourceKind: 'map' });
    expect(mockDiff).toHaveBeenCalledTimes(1);
    expect(mockDiff.mock.calls[0][0]).toBe(RESOURCE_PUBLIC_ID);
    expect(mockDiff.mock.calls[0][1]).toBe('map');
    expect(mockDiff.mock.calls[0][2]).toBe(NEW_VERSION);
  });

  it('shows a loading status and then the version pair', async () => {
    mockDiff.mockResolvedValue(diffResult({ diff: { content: [{ status: 'added', content_type: 'block', internal_name: 'a', after: { display_name: 'A' } }] } }));
    const cache: VersionChangeCache = new Map();
    await mount(cache);
    expect(container.textContent).toContain('1.1.0 compared with 1.0.0');
    expect(container.textContent).toContain('Added');
    expect(container.textContent).toContain('A');
  });

  it('does not request anything for an unsupported resource kind', async () => {
    await mount(new Map(), { resourceKind: 'pack' });
    expect(mockDiff).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('reports the first public version instead of an empty card', async () => {
    mockDiff.mockResolvedValue(diffResult({ from_version_public_id: null, status: 'unavailable', diff: null }));
    await mount(new Map());
    expect(container.textContent).toContain('first public version');
    expect(container.textContent).not.toContain('No structured change summary');
  });

  it('falls back to readable copy when a stored diff is missing', async () => {
    mockDiff.mockResolvedValue(diffResult({ status: 'unavailable', diff: null }));
    await mount(new Map());
    expect(container.textContent).toContain('No structured change summary is available for this version.');
    expect(container.textContent).not.toContain('Raw payload');
  });

  it('treats an unknown status with a diff as unavailable rather than dumping it', async () => {
    mockDiff.mockResolvedValue(diffResult({ status: 'ready', diff: { content: [{ status: 'added', content_type: 'block', internal_name: 'x' }] } }));
    await mount(new Map());
    // The DTO example says `ready` but the writer only stores `completed`.
    expect(container.textContent).toContain('No structured change summary is available for this version.');
    expect(container.textContent).not.toContain('x');
  });

  it('offers a retry after a failed request and refetches on demand', async () => {
    mockDiff.mockRejectedValueOnce(new Error('network down'));
    const cache: VersionChangeCache = new Map();
    await mount(cache);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load the version change summary.');
    mockDiff.mockResolvedValue(diffResult({ diff: { content: [] } }));
    await click(container.querySelector('[role="alert"] button'));
    expect(mockDiff).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('No structured differences were found.');
  });

  it('reuses the cache instead of refetching the same version pair', async () => {
    mockDiff.mockResolvedValue(diffResult({ diff: { content: [] } }));
    const cache: VersionChangeCache = new Map();
    await mount(cache);
    await act(async () => { root?.unmount(); });
    root = null;
    container.remove();
    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    await mount(cache);
    expect(mockDiff).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('No structured differences were found.');
  });

  it('groups mod content changes by type and prefers display names', async () => {
    mockDiff.mockResolvedValue(diffResult({
      diff: {
        ...FORBIDDEN_FIELDS,
        content: [
          { status: 'added', content_type: 'block', internal_name: 'new-block', after: { display_name: 'New Block', internal_name: 'new-block' } },
          { status: 'removed', content_type: 'block', internal_name: 'old-block', before: { display_name: null, internal_name: 'old-block' } },
          { status: 'renamed', content_type: 'item', internal_name: 'new-item', previous_internal_name: 'old-item', before: { internal_name: 'old-item' }, after: { internal_name: 'new-item' } },
          { status: 'changed', content_type: 'unit', internal_name: 'walker', before: { display_name: 'Walker Mk1' }, after: { display_name: 'Walker Mk2' } },
          { status: 'added', content_type: 'unknown-type', internal_name: 'mystery', after: { display_name: 'Mystery' } },
        ],
      },
    }));
    await mount(new Map());
    const text = container.textContent || '';
    expect(text).toContain('New Block');
    expect(text).toContain('old-block');
    expect(text).toContain('old-item → new-item');
    expect(text).toContain('Walker Mk1 → Walker Mk2');
    expect(text).toContain('Mystery');
    expect(text).toContain('Blocks');
    expect(text).toContain('Items');
    expect(text).toContain('Units');
    expect(text).toContain('Other content');
    expect(text).toContain('Renamed');
  });

  it('never renders dependencies, compatibility, manifest, hashes, game versions or unknown fields', async () => {
    mockDiff.mockResolvedValue(diffResult({
      diff: { ...FORBIDDEN_FIELDS, content: [{ status: 'added', content_type: 'block', internal_name: 'visible', after: { display_name: 'Visible' } }] },
    }));
    await mount(new Map());
    const text = container.textContent || '';
    const html = container.innerHTML;
    expect(text).toContain('Visible');
    for (const leaked of [
      'leaked-dependency', 'leaked compatibility note', 'leaked.jar', 'deadbeef', 'v6', 'v8',
      'Leaked manifest name', 'leaked-content-hash', 'leaked-structure-hash', 'leakedRule',
      'leaked-unknown-value', 'leaked-download-key', '/srv/leaked/path.jar', '100',
    ]) {
      expect(text).not.toContain(leaked);
      expect(html).not.toContain(leaked);
    }
  });

  it('marks schematic analysis as a theoretical estimate and ignores raw analysis blobs', async () => {
    mockDiff.mockResolvedValue(diffResult({
      diff: {
        ...FORBIDDEN_FIELDS,
        metadata: [
          { field: 'width', before: 12, after: 20 },
          { field: 'block_count', before: 40, after: 60 },
          { field: 'min_supported_build', before: 100, after: 146 },
          { field: 'content_hash', before: 'aaa', after: 'bbb' },
        ],
        blocks: { added: [{ internal_name: 'conveyor', count: 4 }], removed: [{ internal_name: 'router', count: 2 }], changed: [] },
        materials: { added: [], removed: [], changed: [{ before: { internal_name: 'copper', amount: 10 }, after: { internal_name: 'copper', amount: 18 } }] },
        production: { before: { power: { net: 1 } }, after: { power: { net: 3 } } },
        power_net_delta: 2,
        logic_processor_count: { before: 1, after: 3 },
      },
    }));
    await mount(new Map(), { resourceKind: 'schematic' });
    const text = container.textContent || '';
    expect(text).toContain('Width: 12 → 20');
    expect(text).toContain('Block count: 40 → 60');
    expect(text).toContain('conveyor · Count 4');
    expect(text).toContain('copper · Count 10 → copper · Count 18');
    expect(text).toContain('Net power change: +2');
    expect(text).toContain('Logic processors: 1 → 3');
    expect(text).toContain('Theoretical estimate');
    expect(text).toContain('not a precise game simulation');
    expect(text).not.toContain('min_supported_build');
    expect(text).not.toContain('content_hash');
    expect(text).not.toContain('aaa');
    expect(text).not.toContain('bbb');
  });

  it('summarizes map gameplay data and keeps rules as a generic note', async () => {
    mockDiff.mockResolvedValue(diffResult({
      diff: {
        ...FORBIDDEN_FIELDS,
        metadata: [
          { field: 'planet', before: 'serpulo', after: 'erekir' },
          { field: 'rules_json', before: '{"a":1}', after: '{"a":2}' },
        ],
        resources: { added: [{ resource_type: 'item', internal_name: 'copper', amount: 500 }], removed: [], changed: [] },
        cores: { added: [], removed: [{ core_type: 'shard', team: 'blue', x: 2, y: 3 }], changed: [] },
        spawns: { added: [], removed: [], changed: [{ before: { spawn_type: 'enemy', team: 'red', x: 9, y: 9, wave: 1 }, after: { spawn_type: 'enemy', team: 'red', x: 10, y: 9, wave: 1 } }] },
        waves: { added: [{ wave_start: 1, wave_end: 5, enemy_count: 40, boss_count: 1 }], removed: [], changed: [] },
      },
    }));
    await mount(new Map(), { resourceKind: 'map' });
    const text = container.textContent || '';
    expect(text).toContain('Planet: serpulo → erekir');
    expect(text).toContain('item · copper · 500');
    expect(text).toContain('shard · blue · (2, 3)');
    expect(text).toContain('enemy · red · (9, 9) · #1 → enemy · red · (10, 9) · #1');
    expect(text).toContain('1–5 · estimated enemies 40 · bosses 1');
    expect(text).toContain('Map rules changed; individual rules are not listed.');
    expect(text).toContain('it is not a tile-by-tile map diff');
    expect(text).not.toContain('{"a":2}');
    expect(text).not.toContain('rules_json');
  });

  it('caps long groups and reports how many rows were dropped', async () => {
    const content = Array.from({ length: 25 }, (_item, index) => ({
      status: 'added' as const, content_type: 'block', internal_name: `block-${index}`, after: { display_name: `Block ${index}` },
    }));
    mockDiff.mockResolvedValue(diffResult({ diff: { content } }));
    await mount(new Map());
    const text = container.textContent || '';
    expect(text).toContain('20 items');
    expect(text).toContain('5 more items are not shown.');
    expect(text).not.toContain('Block 24');
  });
});
