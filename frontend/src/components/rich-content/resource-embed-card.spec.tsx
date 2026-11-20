/**
 * Resource cards are rendered strictly by `status`. These tests pin the three
 * states the server can return, plus the clipboard action, without relying on
 * the network: the hydration loader is mocked.
 */
jest.mock('@/i18n/provider', () => {
  const labels: Record<string, string> = {
    'resourceEmbed.invalid.title': 'Invalid resource card',
    'resourceEmbed.invalid.description': 'The resource id is missing or malformed.',
    'resourceEmbed.card.loading': 'Loading resource card…',
    'resourceEmbed.card.loadFailed': 'Could not load the resource card',
    'resourceEmbed.card.retry': 'Retry',
    'resourceEmbed.card.unavailable': 'Resource unavailable',
    'resourceEmbed.card.unavailableHint': 'This resource is not public.',
    'resourceEmbed.card.pendingBadge': 'Pending review',
    'resourceEmbed.card.pendingNotice': 'This resource is awaiting review and is visible only to its author.',
    'resourceEmbed.card.pendingUntitled': 'Resource pending review',
    'resourceEmbed.card.untitled': 'Untitled resource',
    'resourceEmbed.card.by': 'By {name}',
    'resourceEmbed.card.authorAvatarAlt': 'Avatar of {name}',
    'resourceEmbed.card.version': 'Version {version}',
    'resourceEmbed.card.previewAlt': 'Preview of {title}',
    'resourceEmbed.card.dimensions': 'Size',
    'resourceEmbed.card.blocks': 'Blocks',
    'resourceEmbed.card.materials': 'Top materials',
    'resourceEmbed.card.materialAmount': '{name} × {amount}',
    'resourceEmbed.card.power': 'Theoretical power',
    'resourceEmbed.card.powerProduction': 'Production {value}',
    'resourceEmbed.card.powerConsumption': 'Consumption {value}',
    'resourceEmbed.card.powerNet': 'Net {value}',
    'resourceEmbed.card.estimated': 'Theoretical estimate',
    'resourceEmbed.card.estimatedDifficulty': 'Estimated difficulty',
    'resourceEmbed.card.mode': 'Mode',
    'resourceEmbed.card.planet': 'Planet',
    'resourceEmbed.card.waves': 'Waves',
    'resourceEmbed.card.logicBadge': 'Includes logic',
    'resourceEmbed.card.viewLogic': 'View built-in mlog',
    'resourceEmbed.card.compareVersions': 'Compare versions',
    'resourceEmbed.card.copySchematic': 'Copy blueprint code',
    'resourceEmbed.card.copying': 'Copying…',
    'resourceEmbed.card.copied': 'Blueprint code copied',
    'resourceEmbed.card.copyFailed': 'Copy failed',
    'resourceEmbed.card.copyNotSchematic': 'The downloaded file is not a blueprint.',
    'resourceEmbed.card.copyUnavailable': 'This resource cannot be copied right now.',
    'resourceEmbed.card.openBlueprintEditor': 'Fork in editor',
    'resourceEmbed.card.openMapEditor': 'View / fork in map editor',
    'resourceEmbed.card.openResource': 'Open resource page',
    'resourceEmbed.card.actions': 'Resource card actions',
    'resourceEmbed.kind.schematic': 'Schematic',
    'resourceEmbed.kind.map': 'Map',
    'resourceEmbed.kind.mod': 'Mod',
    'resourceEmbed.kind.pack': 'Pack',
    'resourceEmbed.kind.resource': 'Resource',
  };
  return {
    useI18n: () => ({
      locale: 'en',
      t: (key: string, values?: Record<string, string | number>) => (labels[key] ?? key)
        .replace(/\{(\w+)\}/g, (_match, name: string) => String(values?.[name] ?? '')),
      setLocale: () => undefined,
    }),
  };
});

jest.mock('@/lib/api/v1/resource-embeds', () => ({
  loadResourceEmbedCard: jest.fn(),
  isResourceEmbedUuid: (value: unknown) => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}));

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
jest.mock('@/store/toast-store', () => ({
  useToastStore: (selector: (state: { showSuccess: jest.Mock; showError: jest.Mock }) => unknown) => selector({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}));

import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { loadResourceEmbedCard, type ResourceEmbedCard as ResourceEmbedCardData } from '@/lib/api/v1/resource-embeds';
import { ResourceEmbedCard } from './resource-embed-card';

const mockLoad = loadResourceEmbedCard as jest.MockedFunction<typeof loadResourceEmbedCard>;
const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => {
    window: Window & typeof globalThis & { close: () => void };
  };
};

let dom: ReturnType<typeof createDom>;
let container: HTMLDivElement;
let root: Root | null = null;
const mockClipboardWrite = jest.fn(async (_value: string) => undefined);

function createDom() {
  return new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
}

const GLOBALS = [
  'window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent',
  'IS_REACT_ACT_ENVIRONMENT',
];
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();

function baseCard(overrides: Partial<ResourceEmbedCardData> = {}): ResourceEmbedCardData {
  return {
    resource_public_id: RESOURCE_ID,
    version_public_id: VERSION_ID,
    status: 'available',
    resource_kind: 'schematic',
    title: 'Copper factory',
    summary: null,
    url: `/resources/${RESOURCE_ID}`,
    preview_url: '/preview.png',
    download_url: '/api/v1/resources/download',
    author: { id: 7, username: 'Builder', avatar_url: null },
    version: '1.2.0',
    schematic: {
      width: 12,
      height: 8,
      block_count: 40,
      top_materials: [
        { internal_name: 'copper', amount: 120 },
        { internal_name: 'lead', amount: 80 },
        { internal_name: 'graphite', amount: 60 },
        { internal_name: 'silicon', amount: 40 },
        { internal_name: 'titanium', amount: 20 },
      ],
      power: { production: 60, consumption: 20, net: 40, estimated: true },
      has_logic: true,
      logic_processor_count: 2,
    },
    map: null,
    reason: null,
    ...overrides,
  };
}

async function mount(props: Partial<ComponentProps<typeof ResourceEmbedCard>> = {}): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ResourceEmbedCard, {
      resourcePublicId: RESOURCE_ID,
      versionPublicId: null,
      ...props,
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

function buttonWithText(text: string): HTMLButtonElement | null {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => (candidate.textContent || '').includes(text)) as HTMLButtonElement | undefined;
  return button ?? null;
}

describe('ResourceEmbedCard', () => {
  beforeAll(() => {
    dom = createDom();
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
    mockLoad.mockReset();
    mockShowSuccess.mockReset();
    mockShowError.mockReset();
    mockClipboardWrite.mockReset();
    Object.defineProperty(dom.window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mockClipboardWrite },
    });
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = null;
    container.remove();
  });

  it('renders an available schematic with facts, estimated power and actions', async () => {
    mockLoad.mockResolvedValue(baseCard());
    await mount();
    const text = container.textContent || '';
    expect(text).toContain('Copper factory');
    expect(text).toContain('Schematic');
    expect(text).toContain('By Builder');
    expect(text).toContain('Version 1.2.0');
    expect(text).toContain('12 × 8');
    expect(text).toContain('Blocks: 40');
    expect(text).toContain('copper × 120');
    expect(text).toContain('lead × 80');
    expect(text).not.toContain('titanium');
    expect(text).toContain('Theoretical estimate');
    expect(text).toContain('Production 60');
    expect(text).toContain('Consumption 20');
    expect(text).toContain('Net 40');
    expect(text).toContain('View built-in mlog');
    expect(text).toContain('Copy blueprint code');
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Preview of Copper factory');
    expect(container.querySelector(`a[href="/resources/${RESOURCE_ID}"]`)).not.toBeNull();
    expect(container.querySelector(`a[href="/resources/${RESOURCE_ID}#logic"]`)).not.toBeNull();
    expect(container.querySelector(`a[href="/resources/${RESOURCE_ID}#updates"]`)).not.toBeNull();
    expect(container.querySelector(`a[href="/tools/blueprint-editor?resource=${RESOURCE_ID}&version=${VERSION_ID}"]`)).not.toBeNull();
  });

  it('never leaks a title or preview for an unavailable resource', async () => {
    mockLoad.mockResolvedValue(baseCard({
      status: 'unavailable',
      title: 'Leaked title',
      preview_url: '/leaked.png',
      author: null,
      schematic: null,
    }));
    await mount();
    const text = container.textContent || '';
    expect(text).toContain('Resource unavailable');
    expect(text).not.toContain('Leaked title');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('marks an author-visible pending resource and hides publish actions', async () => {
    mockLoad.mockResolvedValue(baseCard({
      status: 'pending_review',
      title: 'Pending schematic',
      preview_url: null,
      schematic: null,
    }));
    await mount();
    const text = container.textContent || '';
    expect(text).toContain('Pending review');
    expect(text).toContain('Pending schematic');
    expect(text).toContain('awaiting review');
    expect(buttonWithText('Copy blueprint code')).toBeNull();
    expect(text).not.toContain('Compare versions');
  });

  it('copies the downloaded blueprint bytes as Base64', async () => {
    const bytes = [0x6d, 0x73, 0x63, 0x68, 0x41, 0x41, 0x41, 0x41];
    const mockFetch = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    }));
    const originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
    try {
      mockLoad.mockResolvedValue(baseCard());
      await mount();
      const copyButton = buttonWithText('Copy blueprint code');
      expect(copyButton).not.toBeNull();
      await act(async () => {
        copyButton?.click();
        // The click handler is fire-and-forget; let its fetch/clipboard chain run.
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/resources/download');
      expect(mockShowError.mock.calls).toEqual([]);
      expect(mockClipboardWrite).toHaveBeenCalledTimes(1);
      const copied = String(mockClipboardWrite.mock.calls[0][0]);
      expect(copied.startsWith('bXNja')).toBe(true);
      expect(mockShowSuccess).toHaveBeenCalledWith('Blueprint code copied');
      expect(mockShowError).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('summarizes a map and links to the map editor', async () => {
    mockLoad.mockResolvedValue(baseCard({
      resource_kind: 'map',
      title: 'Serpulo survival',
      schematic: null,
      map: {
        width: 100,
        height: 80,
        game_mode: 'survival',
        planet: 'serpulo',
        wave_count: 25,
        estimated_difficulty: 7.5,
      },
    }));
    await mount();
    const text = container.textContent || '';
    expect(text).toContain('Size: 100 × 80');
    expect(text).toContain('Mode: survival');
    expect(text).toContain('Planet: serpulo');
    expect(text).toContain('Waves: 25');
    expect(text).toContain('Estimated difficulty: 7.5');
    expect(container.querySelector(`a[href="/tools/map-editor?resource=${RESOURCE_ID}&version=${VERSION_ID}"]`)).not.toBeNull();
    expect(buttonWithText('Copy blueprint code')).toBeNull();
  });

  it('shows the loader error with a retry that refetches', async () => {
    mockLoad.mockRejectedValueOnce(new Error('network down'));
    await mount();
    expect(container.textContent).toContain('Could not load the resource card');
    mockLoad.mockResolvedValueOnce(baseCard());
    const retry = buttonWithText('Retry');
    expect(retry).not.toBeNull();
    await act(async () => {
      retry?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockLoad).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Copper factory');
  });
});
