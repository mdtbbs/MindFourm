import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import {
  createResourceDirectVersionDraft,
  exportResourceWorkbenchMapV2,
  getResourceWorkbenchV2KindTabData,
  uploadResourceDirectDraft,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
} from '@/lib/api/v1/resources';
import MapLightEditor from './map-light-editor';

jest.mock('@/lib/api/v1/resources', () => ({
  createResourceDirectVersionDraft: jest.fn(),
  exportResourceWorkbenchMapV2: jest.fn(),
  getResourceWorkbenchV2KindTabData: jest.fn(),
  uploadResourceDirectDraft: jest.fn(),
}));

jest.mock('@/i18n/provider', () => {
  const translate = (key: string) => key;
  return { useI18n: () => ({ locale: 'en', t: translate }) };
});

const mockGetMapData = getResourceWorkbenchV2KindTabData as jest.MockedFunction<typeof getResourceWorkbenchV2KindTabData>;
const mockExport = exportResourceWorkbenchMapV2 as jest.MockedFunction<typeof exportResourceWorkbenchMapV2>;
const mockCreateDraft = createResourceDirectVersionDraft as jest.MockedFunction<typeof createResourceDirectVersionDraft>;
const mockUploadDraft = uploadResourceDirectDraft as jest.MockedFunction<typeof uploadResourceDirectDraft>;

type TestDom = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => TestDom;
};

const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const DRAFT_ID = '33333333-3333-4333-8333-333333333333';

const editorSummary = {
  width: 4,
  height: 4,
  cores: [{ x: 1, y: 1, name: 'core-shard', team: 'sharded', size: 3 }],
  tile_layers: {
    terrain: [],
    buildings: [{ x: 3, y: 3, name: 'duo', team: 'sharded', size: 1 }],
    enemy_spawns: [{ x: 2, y: 2, name: 'spawn1' }],
    object_catalog: {
      cores: ['core-shard'], spawns: ['spawn1'], buildings: ['duo'], teams: ['sharded', 'crux'],
    },
    objects_truncated: false,
  },
};

function selectedVersion(): ResourceWorkbenchV2Version {
  return {
    public_id: VERSION_ID, version: '1.0.0', display_version: '1.0.0', version_mode: 'semver', revision: 1,
    release_channel: 'release', recommended: true, game_version_min: null, game_version_max: null,
    status: 'published', published_at: '2026-10-01T00:00:00.000Z', compatibility: [], dependencies: [],
    files: [{
      public_id: DRAFT_ID, role: 'primary', delivery_mode: 'managed', platform: null, architecture: null,
      package_type: null, display_name: 'Test map', original_filename: 'baseline.msav',
      mime_type: 'application/octet-stream', size_bytes: 256, sha256: 'a'.repeat(64),
      integrity_status: 'verified', availability_status: 'available', downloadable: true, installable: true,
      download_url: '/download/test',
    }],
  };
}

function workbench(): ResourceWorkbenchV2Response {
  return {
    resource: { public_id: RESOURCE_ID } as ResourceWorkbenchV2Response['resource'],
    permissions: { role: 'owner', can_manage: true }, versions: [], analysis: null, relations: [],
    stats: { views: 0, downloads: 0, likes: 0, favorites: 0, rating_count: 0, rating_average: 0 },
  } as ResourceWorkbenchV2Response;
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('MapLightEditor object operations', () => {
  let dom: TestDom;
  let container: HTMLDivElement;
  let root: Root | null = null;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
    for (const name of globals) originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: dom.window }, document: { configurable: true, value: dom.window.document },
      navigator: { configurable: true, value: dom.window.navigator }, HTMLElement: { configurable: true, value: dom.window.HTMLElement },
      Node: { configurable: true, value: dom.window.Node }, Event: { configurable: true, value: dom.window.Event },
      MouseEvent: { configurable: true, value: dom.window.MouseEvent },
      IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true, writable: true },
    });
  });

  beforeEach(() => {
    mockGetMapData.mockReset().mockResolvedValue({ summary: editorSummary } as never);
    mockExport.mockReset().mockResolvedValue(new Blob([new Uint8Array([0x4d, 0x53, 0x41, 0x56])], { type: 'application/octet-stream' }));
    mockCreateDraft.mockReset().mockResolvedValue({ draft_status: 'completed', version_public_id: DRAFT_ID } as never);
    mockUploadDraft.mockReset().mockResolvedValue(undefined as never);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    container.remove();
  });

  afterAll(() => {
    dom.window.close();
    for (const name of globals) {
      const descriptor = originalGlobals.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  it('lets a user move a core and change its team, then sends typed operations through export', async () => {
    const onSaved = jest.fn();
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(MapLightEditor, { workbench: workbench(), version: selectedVersion(), canEdit: true, onSaved }));
      await flushEffects();
    });
    expect(mockGetMapData).toHaveBeenCalledWith(RESOURCE_ID, 'map', 'rules', VERSION_ID, undefined, expect.objectContaining({ signal: expect.any(Object) }));

    const objectsTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('地图对象'));
    if (!objectsTab) throw new Error('Map object editing tab was not rendered');
    await act(async () => { objectsTab.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });

    const core = Array.from(container.querySelectorAll('article')).find((article) => article.querySelector('strong')?.textContent === 'core-shard');
    if (!core) throw new Error('Core editor row was not rendered');
    const coordinates = core.querySelectorAll('input[type="number"]');
    const team = core.querySelector('select');
    const apply = Array.from(core.querySelectorAll('button')).find((button) => button.textContent?.includes('应用'));
    if (!coordinates[0] || !team || !apply) throw new Error('Core edit controls were not rendered');

    await act(async () => {
      Simulate.change(coordinates[0], { target: { value: '2' } as unknown as EventTarget });
      Simulate.change(team, { target: { value: 'crux' } as unknown as EventTarget });
    });
    await act(async () => { apply.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('待保存对象操作：2');

    const save = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('保存为新版本'));
    if (!save) throw new Error('Save as new version control was not rendered');
    await act(async () => {
      save.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });

    expect(mockExport).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, {
      terrain_changes: [], rule_changes: {}, wave_operations: [],
      object_operations: [
        { action: 'move', object_type: 'core', from_x: 1, from_y: 1, to_x: 2, to_y: 1 },
        { action: 'team', object_type: 'core', x: 1, y: 1, team: 'crux' },
      ],
    });
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockUploadDraft).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(DRAFT_ID);
  });
});
