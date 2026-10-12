import { JSDOM } from 'jsdom';

// The dialog reaches `RichHtmlBlock`, which lazily imports the document viewer.
// Both stay off the typing path, so stubbing it keeps this suite about the panel
// and away from anything the browser would have to load.
jest.mock('../../frontend/src/components/rich-content/rich-html-block', () => ({
  RichHtmlBlock: (props: { html: string }) => require('react').createElement('div', { 'data-testid': 'rich-html-block-stub' }, props.html),
}));
jest.mock('../../frontend/src/lib/api/client', () => ({
  inlineImageApi: { importRemote: jest.fn(), upload: jest.fn() },
}));

/**
 * The HTML block panel's typing path.
 *
 * Sanitizing on every keystroke cost ~21ms per character at 60KB and ~63ms at
 * 180KB, over a document the author is still writing. These cases assert the
 * three properties its replacement has to keep: preview is off until asked for,
 * typing never runs the sanitizer, and an import in flight can be cancelled.
 *
 * Globals are installed before the component modules load — the dialog primitive
 * reads `window` at import time — so everything under test is required inside the
 * suite rather than at the top of the file.
 */
describe('HtmlBlockDialog', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let root: { unmount: () => void; render: (node: unknown) => void };
  let act: (run: () => void | Promise<void>) => Promise<void>;
  let React: typeof import('react');
  let HtmlBlockDialog: typeof import('../../frontend/src/components/rich-content/html-block-dialog').HtmlBlockDialog;
  let trustedHtml: typeof import('../../frontend/src/lib/tiptap/trusted-html');
  let htmlDocument: typeof import('../../frontend/src/lib/tiptap/html-document');
  const globals = globalThis as any;

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
    for (const key of Object.getOwnPropertyNames(dom.window)) {
      if (key in globals) continue;
      try { globals[key] = (dom.window as any)[key]; } catch { /* non-configurable window members */ }
    }
    Object.defineProperty(globals, 'navigator', { configurable: true, value: dom.window.navigator });
    Object.assign(globals, { window: dom.window, document: dom.window.document });
    // jsdom's timers only exist under `pretendToBeVisual`; base-ui needs both.
    globals.requestAnimationFrame ||= (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0);
    globals.cancelAnimationFrame ||= (handle: number) => clearTimeout(handle);
    globals.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    globals.IS_REACT_ACT_ENVIRONMENT = true;

    React = require('react');
    act = React.act;
    root = require('react-dom/client').createRoot;
    HtmlBlockDialog = require('../../frontend/src/components/rich-content/html-block-dialog').HtmlBlockDialog;
    trustedHtml = require('../../frontend/src/lib/tiptap/trusted-html');
    htmlDocument = require('../../frontend/src/lib/tiptap/html-document');
  });

  beforeEach(() => {
    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    root = require('react-dom/client').createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    dom.window.document.body.innerHTML = '';
  });

  const body = () => dom.window.document.body;
  const textarea = () => body().querySelector('#html-block-input') as HTMLTextAreaElement;
  const button = (label: string) => Array.from(body().querySelectorAll('button')).find((candidate) => candidate.textContent === label)!;
  const render = async (props: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(React.createElement(HtmlBlockDialog, { open: true, onOpenChange: jest.fn(), onSubmit: jest.fn(), ...props }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  };
  const type = async (value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea(), value);
      textarea().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };

  it('does not render a preview until the author asks for one', async () => {
    await render({ initialHtml: '<div style="padding:16px"><h3>简介</h3></div>' });
    expect(body().querySelector('[data-testid="rich-html-block-stub"]')).toBeNull();
    expect(body().textContent).toContain('刷新预览');
  });

  it('never sanitizes while typing', async () => {
    const fragmentSpy = jest.spyOn(trustedHtml, 'sanitizeTrustedHtmlClient');
    const documentSpy = jest.spyOn(htmlDocument, 'sanitizeHtmlDocument');
    await render();
    const head = '<!doctype html><html><head><style>.a{display:grid}</style></head><body><p>';
    await type(head + '一</p></body></html>');
    await type(head + '一二</p></body></html>');
    await type(head + '一二三</p></body></html>');
    expect(documentSpy).not.toHaveBeenCalled();
    expect(fragmentSpy).not.toHaveBeenCalled();
    fragmentSpy.mockRestore();
    documentSpy.mockRestore();
  });

  it('previews the sanitized markup only when the button is pressed', async () => {
    const documentSpy = jest.spyOn(htmlDocument, 'sanitizeHtmlDocument');
    await render();
    await type('<!doctype html><html><body><p>正文</p><script>alert(1)</script></body></html>');
    expect(documentSpy).not.toHaveBeenCalled();
    await act(async () => { button('刷新预览').click(); });
    expect(documentSpy).toHaveBeenCalledTimes(1);
    const preview = body().querySelector('[data-testid="rich-html-block-stub"]');
    expect(preview?.textContent).toContain('正文');
    expect(preview?.textContent).not.toContain('alert');
    documentSpy.mockRestore();
  });

  it('summarises the draft so the author sees the import cost before submitting', async () => {
    await render();
    await type('<p>文字</p><img src="data:image/png;base64,YWJj"><img src="https://external.test/a.png">');
    expect(body().textContent).toContain('待导入图片 2 张');
  });

  it('reports progress and offers cancellation while an import is running', async () => {
    const { inlineImageApi } = require('../../frontend/src/lib/api/client');
    let release: (value: { url: string; original_name: string }) => void = () => {};
    (inlineImageApi.importRemote as jest.Mock).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await render({ initialHtml: '<html><body><img src="https://external.test/a.png"></body></html>' });

    await act(async () => {
      button('保存区块').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(body().textContent).toContain('正在导入图片 0 / 1');
    const cancel = button('取消导入');
    expect(cancel).toBeTruthy();
    await act(async () => {
      cancel.click();
      release({ url: '/uploads/a.png', original_name: 'a.png' });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(body().textContent).toContain('导入已取消');
  });
});
