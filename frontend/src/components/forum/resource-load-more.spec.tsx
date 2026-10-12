import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockList = jest.fn();
jest.mock('@/lib/api/client', () => ({ resourceApi: { list: (...args: unknown[]) => mockList(...args) } }));
jest.mock('./resource-row', () => ({
  __esModule: true,
  default: (props: { resource: { id: number } }) => require('react').createElement('div', { 'data-resource-id': props.resource.id }),
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

let ResourceLoadMore: typeof import('./resource-load-more').default;

const page = (ids: number[], nextCursor: string | null) => ({
  data: ids.map((id) => ({ id }) as never),
  next_cursor: nextCursor,
  has_more: nextCursor !== null,
});

async function mount(props: Parameters<typeof ResourceLoadMore>[0]) {
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ResourceLoadMore, props));
  });
}

async function clickLoadMore() {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
    .find((item) => item.textContent?.includes('加载更多'))!;
  await act(async () => { button.click(); });
}

describe('ResourceLoadMore pagination', () => {
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
    ResourceLoadMore = require('./resource-load-more').default;
  });

  beforeEach(() => {
    mockList.mockReset();
    container.innerHTML = '';
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

  it('repeats every structured map condition on the next page', async () => {
    mockList.mockResolvedValueOnce(page([4, 5], null));
    await mount({
      initialResources: [{ id: 1 } as never, { id: 2 } as never, { id: 3 } as never],
      initialCursor: 'cursor-1',
      hasMore: true,
      categoryId: 7,
      search: 'reactor',
      sort: 'download_count',
      tag: 'campaign',
      supportedVersion: 'V8',
      compatibility: 'Linux',
      resourceKind: 'map',
      mapFilters: { planet: 'serpulo', block: 'router', width: 128, height: 128 },
    });

    await clickLoadMore();

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList.mock.calls[0][0]).toEqual({
      cursor: 'cursor-1',
      limit: 30,
      category_id: 7,
      search: 'reactor',
      sort: 'download_count',
      tag: 'campaign',
      supported_version: 'V8',
      compatibility: 'Linux',
      resource_kind: 'map',
      planet: 'serpulo',
      block: 'router',
      width: 128,
      height: 128,
    });
    expect(container.querySelectorAll('[data-resource-id]')).toHaveLength(5);
  });

  it('sends no map condition when the resource kind is not map or blueprint', async () => {
    mockList.mockResolvedValueOnce(page([2], null));
    await mount({
      initialResources: [{ id: 1 } as never],
      initialCursor: 'cursor-1',
      hasMore: true,
      resourceKind: 'mod',
      mapFilters: {},
    });

    await clickLoadMore();

    const params = mockList.mock.calls[0][0] as Record<string, unknown>;
    for (const key of ['planet', 'block', 'width', 'height']) expect(params[key]).toBeUndefined();
  });

  it('offers no continuation once the server reports the last page', async () => {
    await mount({
      initialResources: [{ id: 1 } as never],
      initialCursor: null,
      hasMore: false,
      resourceKind: 'map',
      mapFilters: { planet: 'serpulo' },
    });

    expect(Array.from(container.querySelectorAll('button')).some((item) => item.textContent?.includes('加载更多'))).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });
});
