import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useInteractionDialogStore } from '@/store/interaction-dialog-store';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }), { virtual: true });
jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({ locale: 'en', t: (key: string) => key, setLocale: jest.fn() }),
}));

type HookValue = ReturnType<typeof useUnsavedChanges>;

describe('useUnsavedChanges', () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookValue: HookValue | null;
  let dom: JSDOM;

  function Probe({ values }: { values: object }) {
    hookValue = useUnsavedChanges(values);
    return React.createElement('div', { 'data-dirty': hookValue.isDirty });
  }

  function currentHookValue(): HookValue {
    if (!hookValue) throw new Error('hook has not rendered');
    return hookValue;
  }

  function renderValues(values: object) {
    act(() => {
      root.render(React.createElement(Probe, { values }));
    });
  }

  beforeEach(() => {
    mockPush.mockClear();
    useInteractionDialogStore.setState({ active: null, queue: [] });
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    hookValue = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    dom.window.close();
    delete (globalThis as { window?: Window }).window;
    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { navigator?: Navigator }).navigator;
  });

  it('tracks edits, guards beforeunload, and returns the loaded snapshot on discard', () => {
    renderValues({ site_name: 'MindForum', tagline: 'Community' });
    act(() => currentHookValue().initialize({ site_name: 'MindForum', tagline: 'Community' }));

    const cleanEvent = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    renderValues({ site_name: 'MindForum 2', tagline: 'Community' });
    expect(currentHookValue().isDirty).toBe(true);

    const dirtyEvent = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    expect(currentHookValue().discard()).toEqual({ site_name: 'MindForum', tagline: 'Community' });
  });

  it('marks an uploaded field saved without clearing other pending edits', () => {
    renderValues({ site_name: 'MindForum', site_logo_url: '/old.png' });
    act(() => currentHookValue().initialize({ site_name: 'MindForum', site_logo_url: '/old.png' }));

    renderValues({ site_name: 'Renamed', site_logo_url: '/old.png' });
    act(() => currentHookValue().markFieldSaved('site_logo_url', '/new.png'));
    renderValues({ site_name: 'Renamed', site_logo_url: '/new.png' });

    expect(currentHookValue().isDirty).toBe(true);
    expect(currentHookValue().discard()).toEqual({ site_name: 'MindForum', site_logo_url: '/new.png' });
  });

  it('tracks nested list settings and returns an independent discard snapshot', () => {
    const initial = { links: [{ label: 'Docs', href: '/docs' }] };
    renderValues(initial);
    act(() => currentHookValue().initialize(initial));

    renderValues({ links: [{ label: 'Help', href: '/help' }] });
    expect(currentHookValue().isDirty).toBe(true);
    expect(currentHookValue().discard()).toEqual(initial);
  });

  it('intercepts an internal link and navigates only after confirming', async () => {
    const initial = { site_name: 'MindForum' };
    renderValues(initial);
    act(() => currentHookValue().initialize(initial));
    renderValues({ site_name: 'Changed' });

    const link = document.createElement('a');
    link.href = '/admin/settings/brand';
    link.textContent = 'Brand settings';
    container.appendChild(link);
    const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => { link.dispatchEvent(click); });

    expect(click.defaultPrevented).toBe(true);
    const request = useInteractionDialogStore.getState().active;
    expect(request?.kind).toBe('confirm');
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      if (!request) throw new Error('confirmation dialog was not queued');
      useInteractionDialogStore.getState().settle(request.id, true);
      await Promise.resolve();
    });
    expect(mockPush).toHaveBeenCalledWith('/admin/settings/brand');
  });
});
