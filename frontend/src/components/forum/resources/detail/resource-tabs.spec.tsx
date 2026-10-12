import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getResourceV2VersionDiff } from '@/lib/api/v1/resources';
import type { Resource } from '@/types';
import ResourceTabs, { type ResourceTab } from './resource-tabs';

jest.mock('@/lib/api/v1/resources', () => ({
  ...jest.requireActual('@/lib/api/v1/resources'),
  getResourceV2VersionDiff: jest.fn(),
}));
jest.mock('@/lib/api/client', () => ({
  resourceApi: { download: (resourceId: number, versionId?: number) => `/api/resources/${resourceId}/download${versionId ? `?version=${versionId}` : ''}` },
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }),
}));
jest.mock('@/components/ui/markdown-renderer', () => ({ __esModule: true, default: ({ content }: { content: string }) => require('react').createElement('div', null, content) }));
jest.mock('@/components/ui/rich-content-renderer', () => ({ __esModule: true, default: () => null }));
jest.mock('../../resource-comment-thread', () => ({ __esModule: true, default: () => null }));
jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, values?: Record<string, string | number>) => {
      const value = values ? Object.entries(values).reduce((text, [name, item]) => text.replace(`{${name}}`, String(item)), key) : key;
      return value;
    },
    setLocale: () => undefined,
  }),
}));

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

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 7,
    public_id: RESOURCE_PUBLIC_ID,
    user_id: 1,
    title: 'Example mod',
    description: null,
    resource_type: 'upload',
    resource_kind: 'mod',
    file_name: null,
    file_path: null,
    file_size: 0,
    mime_type: null,
    external_url: null,
    version: '1.1.0',
    content: null,
    content_html: null,
    category_id: null,
    category_name: null,
    category_icon: null,
    download_count: 0,
    is_public: true,
    status: 'published',
    use_mfl: false,
    mfl_download_url: null,
    username: 'author',
    avatar_url: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    versions: [
      { id: 2, public_id: NEW_VERSION, resource_id: 7, version: '1.1.0', file_path: null, file_name: 'a.jar', file_size: 10, mime_type: null, content: null, content_html: null, created_at: '2026-10-02T00:00:00.000Z' },
      { id: 1, public_id: OLD_VERSION, resource_id: 7, version: '1.0.0', file_path: null, file_name: 'a.jar', file_size: 9, mime_type: null, content: null, content_html: null, created_at: '2026-10-01T00:00:00.000Z' },
    ],
    ...overrides,
  } as Resource;
}

/** The summary is behind next/dynamic, so settle the chunk plus the fetch it starts. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 8; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(activeTab: ResourceTab, selectedVersionPublicId?: string, props: Partial<Resource> = {}): Promise<void> {
  await act(async () => {
    root?.render(createElement(ResourceTabs, {
      resource: resource(props),
      selectedVersionPublicId,
      activeTab,
      onChange: () => undefined,
      downloadUrl: '/download',
      commentCount: 0,
      onCommentCountChange: () => undefined,
    }));
  });
  await settle();
}

describe('ResourceTabs version change summary', () => {
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
    mockDiff.mockResolvedValue({ from_version_public_id: OLD_VERSION, to_version_public_id: NEW_VERSION, status: 'completed', parser_version: 'p', diff: { content: [] } });
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = null;
    container.remove();
  });

  it('requests nothing while the Updates tab is closed', async () => {
    await render('overview', NEW_VERSION);
    await render('versions', NEW_VERSION);
    expect(mockDiff).not.toHaveBeenCalled();
  });

  it('requests the newest published version once when Updates opens', async () => {
    await render('updates');
    expect(mockDiff).toHaveBeenCalledTimes(1);
    expect(mockDiff.mock.calls[0][2]).toBe(NEW_VERSION);
  });

  it('uses the selected historical version as to_version', async () => {
    await render('updates', OLD_VERSION);
    expect(mockDiff).toHaveBeenCalledTimes(1);
    expect(mockDiff.mock.calls[0][2]).toBe(OLD_VERSION);
  });

  it('does not refetch when switching tabs back and forth', async () => {
    await render('updates', NEW_VERSION);
    await render('versions', NEW_VERSION);
    await render('updates', NEW_VERSION);
    await render('updates', OLD_VERSION);
    expect(mockDiff).toHaveBeenCalledTimes(2);
    expect(mockDiff.mock.calls.map((call) => call[2])).toEqual([NEW_VERSION, OLD_VERSION]);
  });

  it('never requests for a resource kind without a diff endpoint', async () => {
    await render('updates', NEW_VERSION, { resource_kind: 'pack' });
    expect(mockDiff).not.toHaveBeenCalled();
  });

  it('keeps the author release notes next to the summary', async () => {
    await render('updates', NEW_VERSION, { versions: [] });
    expect(container.textContent).toContain('resourceTabs.noChangelog');
  });
});
