import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ToolCenter from './tool-center';
import { getEditorStatus, type EditorStatus } from '@/lib/editors/editor-api';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }, children),
}));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock('@/lib/editors/editor-api', () => ({ getEditorStatus: jest.fn() }));

type TestDom = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean; url: string }) => TestDom;
};

const ready = (enabled: boolean): EditorStatus => ({
  schematic: { enabled, reason: enabled ? null : 'renderer_unavailable', full_logic: enabled },
  map: { enabled, reason: enabled ? null : 'renderer_unavailable' },
  wave: { enabled, reason: enabled ? null : 'renderer_unavailable' },
});

describe('tool center editor capabilities', () => {
  let root: Root;
  let container: HTMLDivElement;
  let dom: TestDom;
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  afterAll(() => {
    dom.window.close();
    for (const name of globals) {
      const descriptor = originalGlobals.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  });

  it('disables online editor cards and explains renderer unavailability', async () => {
    (getEditorStatus as jest.Mock).mockResolvedValue(ready(false));
    await act(async () => { root.render(createElement(ToolCenter)); await Promise.resolve(); });
    expect(container.querySelector('a[href="/tools/blueprint-editor"]')).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Mindustry Renderer 尚未就绪');
  });

  it('keeps editor links available when Renderer operations and storage are ready', async () => {
    (getEditorStatus as jest.Mock).mockResolvedValue(ready(true));
    await act(async () => { root.render(createElement(ToolCenter)); await Promise.resolve(); });
    for (const href of ['/tools/blueprint-editor', '/tools/map-editor', '/tools/wave-editor']) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });
});
