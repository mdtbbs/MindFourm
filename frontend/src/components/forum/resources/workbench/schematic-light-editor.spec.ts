import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import {
  analyzeResourceWorkbenchVersionV2,
  exportResourceWorkbenchSchematicV2,
  getResourceV2SchematicBlocks,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
} from '@/lib/api/v1/resources';
import SchematicLightEditor from './schematic-light-editor';

jest.mock('@/lib/api/v1/resources', () => ({
  analyzeResourceWorkbenchVersionV2: jest.fn(),
  exportResourceWorkbenchSchematicV2: jest.fn(),
  getResourceV2SchematicBlocks: jest.fn(),
}));

jest.mock('@/i18n/provider', () => {
  const translations: Record<string, string> = {
    'resourceWorkbenchV2.schematicEditor.title': 'Light schematic editor',
    'resourceWorkbenchV2.schematicEditor.help': 'Safe server-side editing.',
    'resourceWorkbenchV2.schematicEditor.loadFailed': 'Could not load block positions',
    'resourceWorkbenchV2.schematicEditor.loading': 'Loading block positions',
    'resourceWorkbenchV2.schematicEditor.noVersion': 'Select a published version',
    'resourceWorkbenchV2.schematicEditor.publishedOnly': 'Published versions only',
    'resourceWorkbenchV2.schematicEditor.ownerOnly': 'Owner or maintainer only',
    'resourceWorkbenchV2.schematicEditor.noBlocks': 'No block positions',
    'resourceWorkbenchV2.schematicEditor.incompleteBlocks': 'Some positions are missing',
    'resourceWorkbenchV2.schematicEditor.rotateLeft': 'Rotate left',
    'resourceWorkbenchV2.schematicEditor.rotateRight': 'Rotate right',
    'resourceWorkbenchV2.schematicEditor.mirror': 'Mirror horizontally',
    'resourceWorkbenchV2.schematicEditor.deleteSelected': 'Delete selected blocks',
    'resourceWorkbenchV2.schematicEditor.removed': 'Removed blocks',
    'resourceWorkbenchV2.schematicEditor.undo': 'Undo',
    'resourceWorkbenchV2.schematicEditor.export': 'Export edited schematic',
    'resourceWorkbenchV2.schematicEditor.exporting': 'Exporting and reanalyzing',
    'resourceWorkbenchV2.schematicEditor.exportFailed': 'Could not safely transform this schematic',
    'resourceWorkbenchV2.schematicEditor.reanalysisFailed': 'Could not reanalyze exported file',
    'resourceWorkbenchV2.schematicEditor.reanalyzing': 'Reanalyzing on server',
    'resourceWorkbenchV2.schematicEditor.reanalysisComplete': 'Server reanalysis complete',
    'resourceWorkbenchV2.schematicEditor.exportedFile': 'Parser block count: {count}',
    'resourceWorkbenchV2.schematicEditor.blockPositions': 'Available positions: {count}',
    'resourceWorkbenchV2.schematicEditor.rotationStatus': 'Quarter turns: {count}; mirrored: {mirror}',
    'resourceWorkbenchV2.schematicEditor.enabled': 'yes',
    'resourceWorkbenchV2.schematicEditor.disabled': 'no',
    'resourceWorkbenchV2.schematicEditor.previewAlt': 'Published schematic preview',
  };
  const translate = (key: string, values?: Record<string, string | number>) => {
    const template = translations[key] || key;
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? `{${name}}`));
  };
  return { useI18n: () => ({ locale: 'en', t: translate }) };
});

const mockGetBlocks = getResourceV2SchematicBlocks as jest.MockedFunction<typeof getResourceV2SchematicBlocks>;
const mockExport = exportResourceWorkbenchSchematicV2 as jest.MockedFunction<typeof exportResourceWorkbenchSchematicV2>;
const mockAnalyze = analyzeResourceWorkbenchVersionV2 as jest.MockedFunction<typeof analyzeResourceWorkbenchVersionV2>;

type TestDom = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => TestDom;
};

const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

function version(status = 'published'): ResourceWorkbenchV2Version {
  return {
    public_id: VERSION_ID,
    version: '1.0.0',
    display_version: '1.0.0',
    version_mode: 'semver',
    revision: 1,
    release_channel: 'release',
    recommended: true,
    game_version_min: null,
    game_version_max: null,
    status,
    published_at: '2026-10-01T00:00:00.000Z',
    compatibility: [],
    dependencies: [],
    files: [{
      public_id: '33333333-3333-4333-8333-333333333333',
      role: 'primary', delivery_mode: 'managed', platform: null, architecture: null, package_type: null,
      display_name: 'Test schematic', original_filename: 'baseline.msch', mime_type: 'application/octet-stream',
      size_bytes: 256, sha256: 'a'.repeat(64), integrity_status: 'verified', availability_status: 'available',
      downloadable: true, installable: true, download_url: '/download/test',
    }],
  };
}

function workbench(): ResourceWorkbenchV2Response {
  return {
    resource: {
      public_id: RESOURCE_ID, resource_kind: 'schematic', title: 'Test schematic', summary: null,
      description: null, content: null, content_format: 'tiptap_json', content_schema_version: 2,
      content_json: null, content_html: null, content_text: null, visibility: 'public',
      source_url: null, license: null,
      metadata: {
        schema_version: 1, tags: [], supported_versions: [], compatibility: [], preview: { url: '/preview.png', status: 'ready' },
        schematic: { name: 'Test', description: null, width: 3, height: 2, blocks: 2, requirements: [] },
      },
      renderer: { status: 'ready', parser_version: 'renderer-1', public_metadata: {}, preview_url: '/preview.png' },
    },
    permissions: { role: 'owner', can_manage: true },
    versions: [], analysis: null, relations: [],
    stats: { views: 0, downloads: 0, likes: 0, favorites: 0, rating_count: 0, rating_average: 0 },
  };
}

const positionsPage = {
  items: [
    { internal_name: 'router', display_name: 'Router', count: 1, positions: [{ x: 0, y: 0, rotation: 0 }] },
    { internal_name: 'conveyor', display_name: 'Conveyor', count: 1, positions: [{ x: 1, y: 0, rotation: 1 }] },
  ],
  pagination: { next_cursor: null, has_more: false },
};

describe('SchematicLightEditor', () => {
  let dom: TestDom;
  let container: HTMLDivElement;
  let root: Root | null = null;
  let createObjectUrl: jest.SpyInstance;
  let anchorClick: jest.SpyInstance;
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
    for (const name of globals) originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
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

  beforeEach(() => {
    mockGetBlocks.mockReset().mockResolvedValue(positionsPage);
    mockExport.mockReset().mockResolvedValue(new Blob([new Uint8Array([0x6d, 0x73, 0x63, 0x68, 1])], { type: 'application/octet-stream' }));
    mockAnalyze.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    createObjectUrl = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:edited-schematic');
    anchorClick = jest.spyOn(dom.window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    container.remove();
    createObjectUrl.mockRestore();
    anchorClick.mockRestore();
  });

  afterAll(() => {
    dom.window.close();
    for (const name of globals) {
      const descriptor = originalGlobals.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  async function mount(canEdit = true, selectedVersion: ResourceWorkbenchV2Version | null = version()): Promise<void> {
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(SchematicLightEditor, { workbench: workbench(), version: selectedVersion, canEdit }));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function click(element: Element | null): Promise<void> {
    if (!element) throw new Error('Expected schematic editor control was not rendered');
    await act(async () => { (element as HTMLElement).click(); });
  }

  it('transforms a published schematic, reanalyzes it, then downloads the official output', async () => {
    let resolveAnalysis!: (value: Awaited<ReturnType<typeof analyzeResourceWorkbenchVersionV2>>) => void;
    mockAnalyze.mockReturnValue(new Promise((resolve) => { resolveAnalysis = resolve; }));
    await mount();

    expect(mockGetBlocks).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, { limit: 100, cursor: undefined });
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Rotate left') || null);
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Mirror horizontally') || null);
    const routerGroup = Array.from(container.querySelectorAll('details > summary')).find((summary) => summary.textContent?.includes('Router'));
    await click(routerGroup || null);
    const firstBlock = routerGroup?.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(firstBlock).not.toBeNull();
    await act(async () => Simulate.change(firstBlock!, { target: { checked: true } as EventTarget & { checked: boolean } }));
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete selected blocks')) || null);

    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Export edited schematic') as HTMLButtonElement | undefined;
    expect(exportButton?.disabled).toBe(false);
    await click(exportButton || null);
    expect(mockExport).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, {
      rotation_quarters: 3,
      mirror_x: true,
      delete_positions: [{ x: 0, y: 0 }],
    });
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    const form = mockAnalyze.mock.calls[0][1];
    expect((form.get('file') as File).name).toBe('baseline-edited.msch');
    expect(anchorClick).not.toHaveBeenCalled();

    await act(async () => {
      resolveAnalysis({
        resource_public_id: RESOURCE_ID,
        resource_kind: 'schematic',
        analysis: { parser_version: 'renderer-1', renderer_metadata: { block_count: 1 }, duplicate: false, findings: [] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(container.textContent).toContain('Server reanalysis complete');
    expect(container.textContent).toContain('Parser block count: 1');
  });

  it('disables export when the server returns incomplete block positions', async () => {
    mockGetBlocks.mockResolvedValueOnce({
      items: [{ internal_name: 'router', display_name: 'Router', count: 2, positions: [{ x: 0, y: 0, rotation: 0 }] }],
      pagination: { next_cursor: null, has_more: false },
    });
    await mount();

    expect(container.textContent).toContain('Some positions are missing');
    const rotateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Rotate left');
    await click(rotateButton || null);
    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Export edited schematic') as HTMLButtonElement | undefined;
    expect(exportButton?.disabled).toBe(true);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('shows position loading failures without enabling export', async () => {
    mockGetBlocks.mockRejectedValueOnce(new Error('positions unavailable'));
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load block positions');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('positions unavailable');
    const rotateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Rotate left');
    await click(rotateButton || null);
    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Export edited schematic') as HTMLButtonElement | undefined;
    expect(exportButton?.disabled).toBe(true);
  });

  it('does not download the transformed bytes if server reanalysis fails', async () => {
    mockAnalyze.mockRejectedValueOnce(new Error('server parser unavailable'));
    await mount();
    const rotateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Rotate right');
    await click(rotateButton || null);
    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Export edited schematic');
    await click(exportButton || null);

    expect(anchorClick).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not safely transform this schematic');
  });

  it('keeps the editor unavailable to viewers and draft versions', async () => {
    await mount(false);
    expect(container.textContent).toContain('Owner or maintainer only');
    expect(mockGetBlocks).not.toHaveBeenCalled();

    if (root) await act(async () => root?.unmount());
    root = null;
    container.replaceChildren();
    await mount(true, version('draft'));
    expect(container.textContent).toContain('Published versions only');
    expect(mockGetBlocks).not.toHaveBeenCalled();
  });
});
