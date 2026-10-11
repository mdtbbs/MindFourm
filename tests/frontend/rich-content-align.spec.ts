// The editor chain reaches `lowlight` through `devlop`, which is ESM-only under
// Jest's CJS runtime; the contract suite stubs it the same way.
jest.mock('lowlight', () => ({
  common: {},
  createLowlight: () => ({ listLanguages: () => [], highlight: () => ({ value: [] }), highlightAuto: () => ({ value: [] }) }),
}));

import { Editor } from '@tiptap/core';
import { JSDOM } from 'jsdom';
import { createTiptapEditorExtensions } from '../../frontend/src/lib/tiptap/editor-extensions';
import { normalizePastedRichHtml } from '../../frontend/src/lib/tiptap/paste-normalization';
import { blockAlignStyle } from '../../frontend/src/lib/tiptap/presentation';
import { normalizeTiptapDocument, renderTiptapDocument } from '../../src/common/utils/tiptap-content.util';

/**
 * Block alignment travels through four places: the paste normalizer, the editor
 * schema, the API validator and the safe-HTML renderer. A value that survives
 * one and dies in another is a silent formatting loss, so this suite walks the
 * whole path with the production extension set.
 */
describe('block alignment round trip', () => {
  let dom: JSDOM;
  let editor: Editor;
  const globals = globalThis as any;
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'DOMParser', 'getSelection', 'ClipboardEvent'];
  const original: Record<string, unknown> = {};

  beforeAll(() => {
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(callback, 0)) as never;
    globalThis.cancelAnimationFrame = ((handle: number) => clearTimeout(handle)) as never;
    dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', { pretendToBeVisual: true });
    for (const key of keys) original[key] = globals[key];
    Object.assign(globals, {
      window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
      Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, DOMParser: dom.window.DOMParser,
      getSelection: dom.window.getSelection.bind(dom.window),
      ClipboardEvent: dom.window.ClipboardEvent || class ClipboardEvent extends dom.window.Event {},
    });
    Object.defineProperty(globals, 'navigator', { configurable: true, value: dom.window.navigator });
    editor = new Editor({ element: dom.window.document.querySelector('#editor') as HTMLElement, extensions: createTiptapEditorExtensions('') });
  });

  afterAll(() => {
    editor?.destroy();
    dom?.window.close();
    for (const key of keys) {
      if (key === 'navigator') Object.defineProperty(globals, key, { configurable: true, value: original[key] });
      else globals[key] = original[key];
    }
  });

  /**
   * Paste through ProseMirror's own clipboard parser. `setContent` with a string
   * goes through the Markdown path instead (`html: false`), which is how the
   * editor loads stored content — not how a browser paste arrives.
   */
  function paste(html: string) {
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
    editor.commands.selectAll();
    editor.view.pasteHTML(normalizePastedRichHtml(html));
    const json = editor.getJSON();
    const canonical = normalizeTiptapDocument(json, { schemaVersion: 2, allowDraftAttachments: true });
    return { json, canonical, html: renderTiptapDocument(canonical, { schemaVersion: 2, allowDraftAttachments: true }) };
  }

  it('keeps alignment the editor sets on paragraphs and headings', () => {
    editor.commands.setContent({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] }] });
    editor.commands.setTextSelection(2);
    expect(editor.commands.setBlockAlign('center')).toBe(true);
    expect(editor.getJSON().content?.[0].attrs).toMatchObject({ level: 2, align: 'center' });
    // `left` is the default: the clear path must not leave the attribute behind.
    editor.commands.setBlockAlign(null);
    expect(editor.getJSON().content?.[0].attrs).toMatchObject({ align: null });
  });

  it('carries pasted alignment all the way to safe HTML', () => {
    const paragraph = paste('<p style="text-align:center">居中</p>');
    expect(paragraph.canonical.content?.[0].attrs).toMatchObject({ align: 'center' });
    expect(paragraph.html).toContain('<p data-align="center" style="text-align:center">');

    const heading = paste('<h3 style="text-align:justify">J</h3>');
    expect(heading.canonical.content?.[0].attrs).toMatchObject({ level: 3, align: 'justify' });
    expect(heading.html).toContain('<h3 data-align="justify"');

    // Wrapper alignment sinks to the blocks inside it.
    const wrapped = paste('<div style="text-align:right"><h2>H</h2><p>p</p></div>');
    expect(wrapped.canonical.content?.map((node) => node.attrs?.align)).toEqual(['right', 'right']);
    expect(wrapped.html).toContain('<h2 data-align="right"');
  });

  it('keeps cell alignment on the cell and drops what the API rejects', () => {
    const { canonical, html } = paste('<table><tbody><tr><td style="text-align:center">c</td></tr></tbody></table>');
    const cell = canonical.content?.[0].content?.[0].content?.[0];
    expect(cell).toMatchObject({ type: 'tableCell', attrs: { align: 'center' } });
    expect(html).toContain('data-align="center"');
    // Everything else in the pasted style is dropped, not passed through.
    const dirty = paste('<p style="text-align:center;position:fixed;color:red" onclick="alert(1)">x</p>');
    expect(dirty.html).not.toMatch(/position|onclick|color:red/);
    expect(dirty.html).toContain('data-align="center"');
  });

  it('renders alignment for the reader with the same allowlist the validator enforces', () => {
    expect(blockAlignStyle('center')).toEqual({ textAlign: 'center' });
    expect(blockAlignStyle('justify')).toEqual({ textAlign: 'justify' });
    expect(blockAlignStyle(null)).toEqual({});
    expect(blockAlignStyle('middle')).toEqual({});
    expect(blockAlignStyle('center; position: fixed')).toEqual({});
    // The API refuses anything outside the four values, so the reader never sees one.
    expect(() => normalizeTiptapDocument({ type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'middle' }, content: [] }] }, { schemaVersion: 2 })).toThrow();
  });
});
