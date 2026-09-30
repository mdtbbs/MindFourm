jest.mock('lowlight', () => ({
  common: {},
  createLowlight: () => ({
    listLanguages: () => [],
    highlight: () => ({ value: [] }),
    highlightAuto: () => ({ value: [] }),
  }),
}));

import { Editor } from '@tiptap/core';
import { JSDOM } from 'jsdom';
import { createTiptapEditorExtensions } from '../../../frontend/src/lib/tiptap/editor-extensions';
import { markdownToTiptapDocument, normalizeTiptapDocument, renderTiptapDocument, serializeTiptapToMarkdown } from './tiptap-content.util';

describe('Rich Content Schema v2 editor/backend contract', () => {
  it('accepts JSON produced by Editor.getJSON() with the production Tiptap extensions', () => {
    const textMarks = [
      { type: 'bold' }, { type: 'italic' }, { type: 'strike' }, { type: 'underline' },
      { type: 'link', attrs: { href: 'https://example.org', title: null, target: null, rel: null, class: 'editor-link' } },
      { type: 'textColor', attrs: { color: '#AABBCC' } },
      { type: 'highlight', attrs: { color: 'yellow' } },
      { type: 'fontSize', attrs: { size: '18px' } },
      { type: 'fontFamily', attrs: { family: 'serif-cn' } },
      { type: 'superscript' }, { type: 'subscript' },
    ];
    const paragraph = (text: string, marks?: Record<string, unknown>[]) => ({
      type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
    });
    const input = {
      type: 'doc',
      content: [
        ...[1, 2, 3, 4, 5, 6].map((level) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: `H${level}` }] })),
        { type: 'paragraph', content: [
          { type: 'text', text: 'all marks', marks: textMarks },
          { type: 'hardBreak' },
          { type: 'mention', attrs: { userId: 23, username: 'member_23' } },
          { type: 'customEmoji', attrs: { id: 12, name: 'mindustry', shortcode: 'mindustry' } },
          { type: 'image', attrs: { src: 'https://cdn.example.org/a.png', alt: 'image', title: null } },
          { type: 'text', text: ' 🌻' },
        ] },
        { type: 'bulletList', attrs: { tight: true }, content: [{ type: 'listItem', content: [paragraph('bullet'), { type: 'orderedList', attrs: { start: 1, tight: true }, content: [{ type: 'listItem', content: [paragraph('nested')] }] }] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph('done')] }] },
        { type: 'blockquote', content: [paragraph('quoted')] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const x = 1;' }] },
        { type: 'table', content: [{ type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null, scope: 'col' }, content: [paragraph('head')] },
          { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [paragraph('cell')] },
        ] }] },
        { type: 'spoiler', attrs: { title: '答案', open: false }, content: [paragraph('hidden'), { type: 'video', attrs: { provider: 'bilibili', videoId: 'BV1xx411c7mD', title: '' } }, { type: 'attachment', attrs: { draftToken: 'A'.repeat(43) } }] },
        { type: 'postQuote', attrs: { postId: 13 } },
        { type: 'replyQuote', attrs: { postId: 13, replyId: 14 } },
      ],
    };
    const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', { pretendToBeVisual: true });
    const globals = globalThis as any;
    const original = {
      window: globals.window,
      document: globals.document,
      navigator: globals.navigator,
      HTMLElement: globals.HTMLElement,
      Node: globals.Node,
      MutationObserver: globals.MutationObserver,
      DOMParser: globals.DOMParser,
      getSelection: globals.getSelection,
    };
    Object.assign(globals, {
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Node: dom.window.Node,
      MutationObserver: dom.window.MutationObserver,
      DOMParser: dom.window.DOMParser,
      getSelection: dom.window.getSelection.bind(dom.window),
    });
    Object.defineProperty(globals, 'navigator', { configurable: true, value: dom.window.navigator });
    dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0) as unknown as number;
    dom.window.cancelAnimationFrame = (handle) => clearTimeout(handle);
    let editorSchemaJson: ReturnType<Editor['getJSON']>;
    let editor: Editor | undefined;
    try {
      editor = new Editor({
        element: dom.window.document.querySelector('#editor') as HTMLElement,
        extensions: createTiptapEditorExtensions(''),
        content: input,
      });
      editorSchemaJson = editor.getJSON();
    } finally {
      editor?.destroy();
      dom.window.close();
      for (const key of Object.keys(original)) {
        const value = original[key as keyof typeof original];
        if (key === 'navigator') Object.defineProperty(globals, key, { configurable: true, value });
        else if (value === undefined) delete globals[key];
        else globals[key] = value;
      }
    }
    const canonical = normalizeTiptapDocument(editorSchemaJson, { schemaVersion: 2, allowDraftAttachments: true });
    const findNode = (nodes: Record<string, any>[], type: string): Record<string, any> | undefined => {
      for (const node of nodes) {
        if (node.type === type) return node;
        const nested = findNode(node.content || [], type);
        if (nested) return nested;
      }
      return undefined;
    };
    expect(canonical.content.find((node) => node.type === 'bulletList')?.attrs).toMatchObject({ tight: true });
    expect(findNode(canonical.content, 'orderedList')?.attrs).toMatchObject({ tight: true });
    expect(canonical.content.find((node) => node.type === 'table')?.content?.[0]).toMatchObject({
      type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph' }] }, { type: 'tableCell', content: [{ type: 'paragraph' }] }],
    });
    expect(renderTiptapDocument(canonical, { schemaVersion: 2, allowDraftAttachments: true })).toContain('<details');
  });

  it('round-trips Markdown task lists and tables through block-shaped table cells', () => {
    const document = markdownToTiptapDocument('- [ ] pending\n- [x] complete\n\n| A | B |\n| --- | --- |\n| one | two |');
    expect(document.content[0]).toMatchObject({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false } }, { type: 'taskItem', attrs: { checked: true } }] });
    expect(document.content[1].content?.[0].content?.[0].content?.[0]).toMatchObject({ type: 'paragraph' });
    const markdown = serializeTiptapToMarkdown(document);
    expect(markdown).toContain('- [ ] pending');
    expect(markdown).toContain('| one | two |');
    expect(renderTiptapDocument(document)).toContain('<td><p>one</p></td>');
  });
});
