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
  const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
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
  /** Enter commits the field without leaving it, so focus never moves on its own. */
  const pressEnter = async (input: HTMLInputElement) => {
    await act(async () => {
      input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
  };
  // React maps onFocus to the bubbling focusin event, so a bare 'focus'
  // dispatch is ignored; focus() is what a user coming back to the field does.
  const focusField = async (input: HTMLInputElement) => {
    await act(async () => { input.focus(); });
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

  it('renders exactly the conditions each kind can answer', async () => {
    // A map's renderer metadata has no block_types, so a map block control
    // could only ever produce an empty list.
    await mount('resource_kind=map', 'map');
    for (const key of ['planet', 'width', 'height']) expect(container.querySelector(`#resource-desktop-map-${key}`)).not.toBeNull();
    expect(container.querySelector('#resource-desktop-map-block')).toBeNull();
    expect(container.textContent).not.toContain('resourceList.blockChip');
    await unmount();

    // No blueprint-side planet source exists, so a blueprint has no planet field.
    await mount('resource_kind=schematic', 'schematic');
    for (const key of ['block', 'width', 'height']) expect(container.querySelector(`#resource-desktop-map-${key}`)).not.toBeNull();
    expect(container.querySelector('#resource-desktop-map-planet')).toBeNull();
    await unmount();
  });

  it('shows the same conditions in the mobile sheet as in the desktop menu', async () => {
    // The sheet shares `mapFilterFields`, so a blueprint must not show a planet
    // control there either — and a map must not show a block one.
    const openSheet = async () => { await act(async () => { trigger().click(); }); };
    const sheetField = (key: string) => container.querySelector(`#resource-mobile-map-${key}`);

    await mount('resource_kind=schematic&block=router', 'schematic');
    await openSheet();
    for (const key of ['block', 'width', 'height']) expect(sheetField(key)).not.toBeNull();
    expect(sheetField('planet')).toBeNull();
    await unmount();

    await mount('resource_kind=map&planet=serpulo', 'map');
    await openSheet();
    for (const key of ['planet', 'width', 'height']) expect(sheetField(key)).not.toBeNull();
    expect(sheetField('block')).toBeNull();
  });

  it('drops a blueprint planet condition from the URL when the first condition is committed', async () => {
    // A hand-edited blueprint planet URL is canonicalised away on the server;
    // the client must not put it back on the next navigation.
    await mount('resource_kind=schematic&planet=erekir', 'schematic');
    expect(container.querySelector('#resource-desktop-map-planet')).toBeNull();
    await setValue(field('desktop', 'width'), '64');
    await commit(field('desktop', 'width'));
    const pushed = pushQuery();
    expect(pushed.has('planet')).toBe(false);
    expect(pushed.get('width')).toBe('64');
    expect(pushed.get('resource_kind')).toBe('schematic');
  });

  it('strips block from the URL when a blueprint becomes a map', async () => {
    await mount('resource_kind=schematic&block=router&width=64&height=64', 'schematic');
    await act(async () => { kindButton('map').click(); });
    const pushed = pushQuery();
    expect(pushed.get('resource_kind')).toBe('map');
    expect(pushed.has('block')).toBe(false);
    expect(pushed.get('width')).toBe('64');
    expect(pushed.get('height')).toBe('64');
  });

  it('drops a hand-edited map block condition as soon as any condition is committed', async () => {
    // SSR already canonicalises this URL; the client must not re-introduce it.
    await mount('resource_kind=map&block=router&planet=serpulo', 'map');
    expect(container.querySelector('#resource-desktop-map-block')).toBeNull();
    await setValue(field('desktop', 'width'), '128');
    await commit(field('desktop', 'width'));
    const pushed = pushQuery();
    expect(pushed.has('block')).toBe(false);
    expect(pushed.get('planet')).toBe('serpulo');
    expect(pushed.get('width')).toBe('128');
    expect(pushed.get('resource_kind')).toBe('map');
  });

  it('offers no block chip for a map and no planet chip for a blueprint', async () => {
    await mount('resource_kind=map&planet=serpulo&width=128', 'map');
    expect(container.textContent).not.toContain('resourceList.blockChip');
    expect(chipFor('planet').textContent).toContain('resourceList.planetChip');
    await unmount();

    await mount('resource_kind=schematic&block=router', 'schematic');
    expect(chipFor('block').textContent).toContain('resourceList.blockChip');
    expect(container.textContent).not.toContain('resourceList.planetChip');
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
    await mount('resource_kind=map&planet=serpulo&width=128&height=128&tag=campaign', 'map');
    await act(async () => { kindButton('mod').click(); });
    const pushed = pushQuery();
    expect(pushed.get('resource_kind')).toBe('mod');
    expect(pushed.get('tag')).toBe('campaign');
    for (const key of ['planet', 'block', 'width', 'height']) expect(pushed.has(key)).toBe(false);
  });

  it('keeps only the dimensions when switching between map and schematic', async () => {
    await mount('resource_kind=map&planet=serpulo&width=128&height=128', 'map');
    await act(async () => { kindButton('schematic').click(); });
    const pushed = pushQuery();
    expect(pushed.get('resource_kind')).toBe('schematic');
    expect(pushed.get('width')).toBe('128');
    expect(pushed.get('height')).toBe('128');
    // planet belongs to map, block to schematic: neither crosses the switch.
    expect(pushed.has('planet')).toBe(false);
    expect(pushed.has('block')).toBe(false);

    await unmount();
    await mount('resource_kind=schematic&block=router&width=64&&height=64', 'schematic');
    await act(async () => { kindButton('map').click(); });
    const backToMap = pushQuery();
    expect(backToMap.get('resource_kind')).toBe('map');
    expect(backToMap.get('width')).toBe('64');
    expect(backToMap.get('height')).toBe('64');
    expect(backToMap.has('block')).toBe(false);
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

  /**
   * D1: a keyboard Tab through both dimension fields commits the second field
   * before the first navigation has rendered. Both commits used to start from
   * the same rendered `searchParams` snapshot, so the second overwrote the
   * first and the condition the user typed silently vanished from the URL.
   */
  it('keeps both dimensions when they are committed by blur without a pause', async () => {
    await mount('resource_kind=map', 'map');
    await setValue(field('desktop', 'width'), '128');
    await commit(field('desktop', 'width'));
    await setValue(field('desktop', 'height'), '64');
    await commit(field('desktop', 'height'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(String(mockPush.mock.calls[0][0])).toBe('/resources?resource_kind=map&width=128');
    expect(String(mockPush.mock.calls[1][0])).toBe('/resources?resource_kind=map&width=128&height=64');
  });

  it('keeps both dimensions when they are committed by Enter without a pause', async () => {
    await mount('resource_kind=map', 'map');
    await setValue(field('desktop', 'width'), '128');
    await pressEnter(field('desktop', 'width'));
    await setValue(field('desktop', 'height'), '64');
    await pressEnter(field('desktop', 'height'));

    expect(mockPush).toHaveBeenCalledTimes(2);
    const last = pushQuery();
    expect(last.get('width')).toBe('128');
    expect(last.get('height')).toBe('64');
    expect(last.get('resource_kind')).toBe('map');
  });

  it('keeps a blueprint block and both dimensions committed back to back', async () => {
    // Blueprint exposes block/width/height, so the same Tab walk crosses three
    // fields: a commit that starts from a stale snapshot loses two of them.
    await mount('resource_kind=schematic', 'schematic');
    await setValue(field('desktop', 'block'), 'router');
    await commit(field('desktop', 'block'));
    await setValue(field('desktop', 'width'), '128');
    await commit(field('desktop', 'width'));
    await setValue(field('desktop', 'height'), '64');
    await pressEnter(field('desktop', 'height'));

    expect(pushQuery().toString()).toBe('resource_kind=schematic&block=router&width=128&height=64');
  });

  it('drops an invalid dimension without taking the freshly committed one with it', async () => {
    await mount('resource_kind=map', 'map');
    await setValue(field('desktop', 'width'), '128');
    await commit(field('desktop', 'width'));
    await setValue(field('desktop', 'height'), '0');
    await commit(field('desktop', 'height'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(pushQuery().toString()).toBe('resource_kind=map&width=128');
  });

  it('commits a valid dimension and keeps the sibling conditions in the same query', async () => {
    await mount('resource_kind=schematic&block=router', 'schematic');
    await setValue(field('desktop', 'width'), '128');
    await commit(field('desktop', 'width'));
    const pushed = pushQuery();
    expect(pushed.get('width')).toBe('128');
    expect(pushed.get('block')).toBe('router');
    expect(pushed.get('resource_kind')).toBe('schematic');
  });

  it('removes only the matching condition when a chip is dismissed', async () => {
    await mount('resource_kind=schematic&block=router&width=128&category_id=3', 'schematic');
    await act(async () => { chipFor('width').click(); });
    const pushed = pushQuery();
    expect(pushed.has('width')).toBe(false);
    for (const key of ['block', 'category_id', 'resource_kind']) expect(pushed.has(key)).toBe(true);
  });

  it('refuses a block name past the backend limit and never sends it', async () => {
    // The backend caps block at 100 characters; a longer value is a 400 and the
    // whole list would render its error state.
    await mount('resource_kind=schematic', 'schematic');
    const block = field('desktop', 'block');
    await setValue(block, 'b'.repeat(101));
    await commit(block);
    expect(mockPush).not.toHaveBeenCalled();
    expect(block.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('resourceList.blockTooLong');

    await setValue(block, 'b'.repeat(100));
    await commit(block);
    expect(pushQuery().get('block')).toBe('b'.repeat(100));
  });

  it('restores the committed value when a rejected field is revisited', async () => {
    await mount('resource_kind=map&width=128', 'map');
    const width = field('desktop', 'width');
    await setValue(width, '0');
    await commit(width);
    // The message stays visible right after the rejection...
    expect(width.getAttribute('aria-invalid')).toBe('true');
    expect(mockPush).not.toHaveBeenCalled();
    // ...but coming back to the field shows the value the URL actually holds.
    await focusField(width);
    expect(width.value).toBe('128');
    expect(width.getAttribute('aria-invalid')).toBeNull();
  });

  it('reopens the mobile sheet from the URL instead of a rejected draft', async () => {
    await mount('resource_kind=map&width=128', 'map');
    await act(async () => { trigger().click(); });
    const sheetWidth = container.querySelector<HTMLInputElement>('#resource-mobile-map-width')!;
    await setValue(sheetWidth, '0');
    await act(async () => { container.querySelector<HTMLButtonElement>('#resource-mobile-filters button[type="button"]:last-child')!.click(); });
    // Apply was called with a rejected value: the URL is untouched.
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => { trigger().click(); });
    expect(container.querySelector<HTMLInputElement>('#resource-mobile-map-width')!.value).toBe('128');
  });

  it('clears every owned filter through the shared canonical outlet', async () => {
    // Clear keeps its "back to /resources" meaning, but now reads the same key
    // set as the field renderers instead of pushing a literal path.
    await mount('resource_kind=map&planet=serpulo&width=128&height=64&tag=campaign&sort=download_count', 'map');
    const clear = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'resourceList.clear')!;
    await act(async () => { clear.click(); });
    expect(mockPush).toHaveBeenLastCalledWith('/resources');
    const pushed = pushQuery();
    for (const key of ['resource_kind', 'planet', 'width', 'height', 'tag', 'sort']) expect(pushed.has(key)).toBe(false);
  });

  it('clears every resource filter from the clear action', async () => {
    await mount('resource_kind=schematic&block=router&width=128&height=64&tag=campaign', 'schematic');
    const clear = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'resourceList.clear')!;
    await act(async () => { clear.click(); });
    expect(mockPush).toHaveBeenLastCalledWith('/resources');
  });
});
