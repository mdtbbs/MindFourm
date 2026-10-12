import { RESOURCE_KINDS } from '@/lib/display-labels';

const mockPush = jest.fn();
let mockCurrentQuery = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(mockCurrentQuery),
}), { virtual: true });

// The map-condition cases never open the mobile sheet, so the motion primitives
// are stubbed rather than exercised through jsdom.
jest.mock('framer-motion', () => ({
  AnimatePresence: (props: { children?: unknown }) => props.children ?? null,
  motion: { div: 'div', section: 'section' },
  useReducedMotion: () => false,
}));

jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, values?: Record<string, string | number>) => values
      ? `${key}(${Object.values(values).join(',')})`
      : key,
  }),
}));

/**
 * Map/blueprint filter behaviour.
 *
 * Globals are installed before `react-dom` and the component module load — both
 * capture `document` at import time — so everything under test is required inside
 * the suite instead of at the top of the file.
 */
describe('ResourceFilters map and blueprint conditions', () => {
  let dom: { window: any };
  let container: HTMLElement;
  let act: (run: () => void | Promise<void>) => Promise<void>;
  let createElement: typeof import('react').createElement;
  let root: { unmount: () => void; render: (node: unknown) => void } | null = null;
  let ResourceFilters: typeof import('./resource-list-filters-client').default;
  const globals = globalThis as any;

  const field = (scope: string, key: string) => container.querySelector<HTMLInputElement>(`#resource-${scope}-map-${key}`)!;
  const pushQuery = () => {
    const call = mockPush.mock.calls[mockPush.mock.calls.length - 1];
    if (!call) throw new Error('router.push was not called');
    return new URLSearchParams(String(call[0]).replace('/resources?', ''));
  };
  const kindButton = (kind: string) => {
    const label = RESOURCE_KINDS.find((item) => item.value === kind)!.label;
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'))
      .find((item) => item.textContent === label);
    if (!button) throw new Error(`missing kind chip for ${kind}`);
    return button;
  };
  const chipFor = (key: string) => {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
      .find((item) => (item.getAttribute('aria-label') || '').includes(`resourceList.${key}Chip`));
    if (!button) throw new Error(`missing chip for ${key}`);
    return button;
  };
  const mount = async (query: string, kind: string) => {
    mockCurrentQuery = query;
    await act(async () => {
      root = require('react-dom/client').createRoot(container);
      root!.render(createElement(ResourceFilters, {
        categories: [], initialResourceKind: kind, supportedVersions: [], compatibilityOptions: [], planets: ['serpulo', 'erekir'],
      }));
    });
  };
  const unmount = async () => { await act(async () => { root?.unmount(); }); root = null; };
  /** React tracks the value property, so write through the native setter first. */
  const setValue = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const commit = async (input: HTMLInputElement) => {
    await act(async () => { input.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); });
  };

  beforeAll(() => {
    const { JSDOM } = require('jsdom');
    const document = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
    dom = document;
    for (const key of Object.getOwnPropertyNames(document.window)) {
      if (key in globals) continue;
      try { globals[key] = document.window[key]; } catch { /* non-configurable window members */ }
    }
    globals.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    globals.requestAnimationFrame ||= (cb: (time: number) => void) => setTimeout(() => cb(0), 0);
    globals.cancelAnimationFrame ||= (handle: number) => clearTimeout(handle);
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: document.window },
      document: { configurable: true, value: document.window.document },
      navigator: { configurable: true, value: document.window.navigator },
    });
    globals.IS_REACT_ACT_ENVIRONMENT = true;

    const React = require('react');
    act = React.act;
    createElement = React.createElement;
    ResourceFilters = require('./resource-list-filters-client').default;
  });

  beforeEach(() => {
    mockPush.mockClear();
    mockCurrentQuery = '';
    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
  });

  afterEach(unmount);

  afterAll(() => { dom.window.close(); });

  it('shows planet, block, width and height while a map or blueprint kind is selected', async () => {
    for (const kind of ['map', 'schematic']) {
      await mount(`resource_kind=${kind}`, kind);
      expect(container.querySelector('#resource-desktop-map-planet')).not.toBeNull();
      expect(container.querySelector('#resource-desktop-map-block')).not.toBeNull();
      expect(container.querySelector('#resource-desktop-map-width')).not.toBeNull();
      expect(container.querySelector('#resource-desktop-map-height')).not.toBeNull();
      await unmount();
    }
  });

  it('hides the map controls and their chips for every other kind', async () => {
    await mount('resource_kind=mod&planet=serpulo&block=router&width=128', 'mod');
    for (const key of ['planet', 'block', 'width', 'height']) {
      expect(container.querySelector(`#resource-desktop-map-${key}`)).toBeNull();
    }
    expect(container.textContent).not.toContain('resourceList.blockChip');
    expect(container.textContent).not.toContain('resourceList.planetChip');
  });

  it('drops hidden map conditions when the kind switches away from map', async () => {
    await mount('resource_kind=map&planet=serpulo&block=router&width=128&height=128&tag=campaign', 'map');
    await act(async () => { kindButton('mod').click(); });
    const pushed = pushQuery();
    expect(pushed.get('resource_kind')).toBe('mod');
    expect(pushed.get('tag')).toBe('campaign');
    for (const key of ['planet', 'block', 'width', 'height']) expect(pushed.has(key)).toBe(false);
  });

  it('keeps valid map conditions when switching between map and schematic', async () => {
    await mount('resource_kind=map&planet=serpulo&block=router&width=128&height=128', 'map');
    await act(async () => { kindButton('schematic').click(); });
    const pushed = pushQuery();
    expect(pushed.get('resource_kind')).toBe('schematic');
    expect(pushed.get('planet')).toBe('serpulo');
    expect(pushed.get('block')).toBe('router');
    expect(pushed.get('width')).toBe('128');
    expect(pushed.get('height')).toBe('128');
  });

  it('never sends an empty, zero, fractional or out-of-range dimension', async () => {
    await mount('resource_kind=map', 'map');
    for (const rejected of ['0', '1.5', '8192', 'abc']) {
      await setValue(field('desktop', 'width'), rejected);
      await commit(field('desktop', 'width'));
      expect(mockPush).not.toHaveBeenCalled();
      expect(field('desktop', 'width').getAttribute('aria-invalid')).toBe('true');
    }
    await setValue(field('desktop', 'width'), '');
    await commit(field('desktop', 'width'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('commits a valid dimension and keeps the sibling conditions in the same query', async () => {
    await mount('resource_kind=map&planet=serpulo&block=router', 'map');
    await setValue(field('desktop', 'width'), '128');
    await commit(field('desktop', 'width'));
    const pushed = pushQuery();
    expect(pushed.get('width')).toBe('128');
    expect(pushed.get('planet')).toBe('serpulo');
    expect(pushed.get('block')).toBe('router');
    expect(pushed.get('resource_kind')).toBe('map');
  });

  it('removes only the matching condition when a chip is dismissed', async () => {
    await mount('resource_kind=map&planet=serpulo&block=router&width=128&category_id=3', 'map');
    await act(async () => { chipFor('width').click(); });
    const pushed = pushQuery();
    expect(pushed.has('width')).toBe(false);
    for (const key of ['planet', 'block', 'category_id', 'resource_kind']) expect(pushed.has(key)).toBe(true);
  });

  it('clears every resource filter from the clear action', async () => {
    await mount('resource_kind=map&planet=serpulo&block=router&width=128&height=64&tag=campaign', 'map');
    const clear = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'resourceList.clear')!;
    await act(async () => { clear.click(); });
    expect(mockPush).toHaveBeenLastCalledWith('/resources');
  });
});
