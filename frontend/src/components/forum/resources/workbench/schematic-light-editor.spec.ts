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
import { fetchV1 } from '@/lib/api/v1/transport';
import SchematicLightEditor from './schematic-light-editor';

jest.mock('@/lib/api/v1/resources', () => ({
  analyzeResourceWorkbenchVersionV2: jest.fn(),
  exportResourceWorkbenchSchematicV2: jest.fn(),
  getResourceV2SchematicBlocks: jest.fn(),
}));

jest.mock('@/lib/api/v1/transport', () => ({
  fetchV1: jest.fn(),
  V1ApiError: class V1ApiError extends Error {},
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
    'resourceWorkbenchV2.schematicEditor.canvas': 'Schematic placement canvas',
    'resourceWorkbenchV2.schematicEditor.selectTool': 'Select',
    'resourceWorkbenchV2.schematicEditor.moveTool': 'Move',
    'resourceWorkbenchV2.schematicEditor.placeTool': 'Place',
    'resourceWorkbenchV2.schematicEditor.blockPalette': 'Block',
    'resourceWorkbenchV2.schematicEditor.selectHelp': 'Select a block on the canvas or in the list.',
    'resourceWorkbenchV2.schematicEditor.moveHelp': 'Move a block.',
    'resourceWorkbenchV2.schematicEditor.placeHelp': 'Place a block.',
    'resourceWorkbenchV2.schematicEditor.canvasDimensions': 'Grid: {width} × {height}',
    'resourceWorkbenchV2.schematicEditor.undoLast': 'Undo last edit',
    'resourceWorkbenchV2.schematicEditor.logicSource': 'Processor source (inert text)',
    'resourceWorkbenchV2.schematicEditor.logicSourceHelp': 'Source is never executed.',
    'resourceWorkbenchV2.schematicEditor.logicLinks': 'Processor links',
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
const mockFetchV1 = fetchV1 as jest.MockedFunction<typeof fetchV1>;

type TestDom = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => TestDom;
};

const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

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
  let catalogFetch: jest.SpyInstance;
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
    catalogFetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ items: [{ type: 'item', name: 'copper', label: '铜', english: 'Copper', category: 'item', size: 1, icon: null }, { type: 'item', name: 'lead', label: '铅', english: 'Lead', category: 'item', size: 1, icon: null }] }) } as Response);
    mockFetchV1.mockReset().mockResolvedValue({
      version_public_id: VERSION_ID,
      schematic: { width: 3, height: 2 },
    } as never);
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
    catalogFetch.mockRestore();
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
      await flushEffects();
    });
  }

  async function click(element: Element | null): Promise<void> {
    if (!element) throw new Error('Expected schematic editor control was not rendered');
    await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  }

  async function clickCell(x: number, y: number) {
    const svg = container.querySelector('svg[role="grid"]') as SVGSVGElement;
    const width = Number(svg.getAttribute('viewBox')!.split(' ')[2]); const height = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
    svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width * 18, bottom: height * 18, width: width * 18, height: height * 18, toJSON: () => ({}) });
    svg.setPointerCapture = () => undefined;
    const event = { pointerId: 1, button: 0, clientX: (x+.5)*18, clientY: (height-y-.5)*18 };
    await act(async () => { Simulate.pointerDown(svg, event); Simulate.pointerUp(svg, event); });
  }

  it('transforms a published schematic, reanalyzes it, then downloads the official output', async () => {
    let resolveAnalysis!: (value: Awaited<ReturnType<typeof analyzeResourceWorkbenchVersionV2>>) => void;
    mockAnalyze.mockReturnValue(new Promise((resolve) => { resolveAnalysis = resolve; }));
    await mount();

    expect(mockGetBlocks).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, { limit: 100, cursor: undefined });
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('整体左转')) || null);
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('水平镜像')) || null);
    await clickCell(0, 0);
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('删除')) || null);

    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('下载 .msch')) as HTMLButtonElement | undefined;
    expect(exportButton?.disabled).toBe(false);
    await click(exportButton || null);
    expect(mockExport).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, {
      rotation_quarters: 1,
      mirror_x: true,
      delete_positions: [{ x: 0, y: 0 }],
      move_positions: [],
      add_blocks: [],
      logic_configs: [],
      config_edits: [],
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
    expect(container.textContent).toContain('官方读写验证');
    expect(container.textContent).toContain('解析方块数：1');
  });

  it('exports a public visitor copy and restores its changes with undo and redo without publication rights', async () => {
    root = createRoot(container);
    await act(async () => { root?.render(createElement(SchematicLightEditor, { workbench: workbench(), version: version(), canEdit: true, canManage: false })); await flushEffects(); });
    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent === '整体右转') || null);
    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent === '撤销') || null);
    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent === '重做') || null);
    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent === '下载 .msch') || null);
    expect(mockExport).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, expect.objectContaining({ rotation_quarters: 3 }));
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('保存为新版本');
  });

  it('disables export when the server returns incomplete block positions', async () => {
    mockGetBlocks.mockResolvedValueOnce({
      items: [{ internal_name: 'router', display_name: 'Router', count: 2, positions: [{ x: 0, y: 0, rotation: 0 }] }],
      pagination: { next_cursor: null, has_more: false },
    });
    await mount();

    expect(container.textContent).toContain('Some positions are missing');
    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('下载 .msch')) as HTMLButtonElement | undefined;
    expect(exportButton).toBeUndefined();
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('moves a multi-tile vanilla building from its anchor through the real canvas', async () => {
    mockGetBlocks.mockResolvedValueOnce({
      items: [{ internal_name: 'core-shard', display_name: 'Core shard', count: 1, positions: [{ x: 1, y: 1, rotation: 0, size: 3 }] }],
      pagination: { next_cursor: null, has_more: false },
    });
    const largeWorkbench = workbench();
    largeWorkbench.resource.metadata.schematic = { ...largeWorkbench.resource.metadata.schematic!, width: 6, height: 5 };
    mockFetchV1.mockResolvedValueOnce({ version_public_id: VERSION_ID, schematic: { width: 6, height: 5 } } as never);
    mockAnalyze.mockResolvedValue({
      resource_public_id: RESOURCE_ID,
      resource_kind: 'schematic',
      analysis: { parser_version: 'renderer-1', renderer_metadata: { block_count: 1 }, duplicate: false, findings: [] },
    });
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(SchematicLightEditor, { workbench: largeWorkbench, version: version(), canEdit: true }));
      await flushEffects();
    });

    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '移动') || null);
    await clickCell(2, 2);
    await clickCell(4, 2);
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('下载 .msch')) || null);

    expect(mockExport).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, {
      rotation_quarters: 0, mirror_x: false, delete_positions: [],
      move_positions: [{ from_x: 1, from_y: 1, to_x: 4, to_y: 2 }], add_blocks: [], logic_configs: [], config_edits: [],
    });
  });

  it('keeps processor links visible and exports edited source as inert text', async () => {
    mockGetBlocks.mockResolvedValueOnce({
      items: [{ internal_name: 'logic-processor', display_name: 'Logic processor', count: 1, positions: [{
        x: 1, y: 1, rotation: 0, size: 1, logic_source_available: true,
        config: { format_version: 1, source: 'print("before")', links: [{ name: 'core', x: 2, y: 3 }] },
      }] }],
      pagination: { next_cursor: null, has_more: false },
    });
    mockAnalyze.mockResolvedValue({
      resource_public_id: RESOURCE_ID,
      resource_kind: 'schematic',
      analysis: { parser_version: 'renderer-1', renderer_metadata: { block_count: 1 }, duplicate: false, findings: [] },
    });
    await mount();

    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent === '高级模式') || null);
    await clickCell(1, 1);
    expect(container.textContent).toContain('core → 2,3');
    const source = container.querySelector('#schematic-logic-source') as HTMLTextAreaElement;
    await act(async () => Simulate.change(source, { target: { value: 'print("after")' } as EventTarget & { value: string } }));
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('下载 .msch')) || null);

    expect(mockExport).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, {
      rotation_quarters: 0, mirror_x: false, delete_positions: [], move_positions: [], add_blocks: [],
      logic_configs: [{ x: 1, y: 1, source: 'print("after")' }],
      config_edits: [],
    });
  });

  it('edits a typed item configuration through its content control and includes it in the official transform', async () => {
    mockGetBlocks.mockResolvedValueOnce({
      items: [{ internal_name: 'sorter', display_name: 'Sorter', count: 1, positions: [{
        x: 2, y: 3, rotation: 0, size: 1,
        config: { type: 'content', content_type: 'item', name: 'copper' },
        config_editable: true, config_types: [{ type: 'content', content_type: 'item' }],
      }] }],
      pagination: { next_cursor: null, has_more: false },
    });
    mockFetchV1.mockResolvedValueOnce({ version_public_id: VERSION_ID, schematic: { width: 4, height: 5 } } as never);
    mockAnalyze.mockResolvedValue({
      resource_public_id: RESOURCE_ID, resource_kind: 'schematic',
      analysis: { parser_version: 'renderer-1', renderer_metadata: { block_count: 1 }, duplicate: false, findings: [] },
    });
    await mount();

    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent === '高级模式') || null);
    await clickCell(2, 3);
    expect(container.textContent).toContain('官方配置类型');
    expect(container.textContent).toContain('铜');
    await click(Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('铅')) || null);
    await click(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('下载 .msch')) || null);

    expect(mockExport).toHaveBeenCalledWith(RESOURCE_ID, VERSION_ID, expect.objectContaining({
      config_edits: [{ x: 2, y: 3, config: { type: 'content', content_type: 'item', name: 'lead' } }],
    }));
  });

  it('shows position loading failures without enabling export', async () => {
    mockGetBlocks.mockRejectedValueOnce(new Error('positions unavailable'));
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load block positions');
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain('positions unavailable');
    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('下载 .msch')) as HTMLButtonElement | undefined;
    expect(exportButton).toBeUndefined();
  });

  it('does not download the transformed bytes if server reanalysis fails', async () => {
    mockAnalyze.mockRejectedValueOnce(new Error('server parser unavailable'));
    await mount();
    const rotateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('整体右转'));
    await click(rotateButton || null);
    const exportButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('下载 .msch'));
    await click(exportButton || null);

    expect(anchorClick).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('server parser unavailable');
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
