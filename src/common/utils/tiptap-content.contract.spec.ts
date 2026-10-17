jest.mock('lowlight', () => ({
  common: {},
  createLowlight: () => ({
    listLanguages: () => [],
    highlight: () => ({ value: [] }),
    highlightAuto: () => ({ value: [] }),
  }),
}));

import { Editor, getSchema } from '@tiptap/core';
import { JSDOM } from 'jsdom';
import { createTiptapEditorExtensions } from '../../../frontend/src/lib/tiptap/editor-extensions';
import { richTableLayout } from '../../../frontend/src/lib/tiptap/table-presentation';
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

/**
 * The editor and the API validator each carry half of the Rich Content schema.
 * When they drift, the toolbar can build a document the API rejects, and the
 * user only learns about it from a failed publish (or a node vanishing on the
 * next edit). These two suites compare the halves directly, so adding a node to
 * one side without the other fails here instead of in production.
 */
describe('editor schema is no wider than the API schema', () => {
  const TXT = (text = 'x') => ({ type: 'text', text });
  const PARAGRAPH = () => ({ type: 'paragraph', content: [TXT()] });
  const SAMPLES: Record<string, () => Record<string, unknown>> = {
    paragraph: PARAGRAPH,
    heading: () => ({ type: 'heading', attrs: { level: 2 }, content: [TXT()] }),
    blockquote: () => ({ type: 'blockquote', content: [PARAGRAPH()] }),
    bulletList: () => ({ type: 'bulletList', content: [{ type: 'listItem', content: [PARAGRAPH()] }] }),
    orderedList: () => ({ type: 'orderedList', content: [{ type: 'listItem', content: [PARAGRAPH()] }] }),
    listItem: () => ({ type: 'listItem', content: [PARAGRAPH()] }),
    taskList: () => ({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [PARAGRAPH()] }] }),
    taskItem: () => ({ type: 'taskItem', attrs: { checked: false }, content: [PARAGRAPH()] }),
    codeBlock: () => ({ type: 'codeBlock', attrs: { language: 'ts' }, content: [TXT('const a = 1;')] }),
    horizontalRule: () => ({ type: 'horizontalRule' }),
    table: () => ({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [PARAGRAPH()] }] }] }),
    tableRow: () => ({ type: 'tableRow', content: [{ type: 'tableCell', content: [PARAGRAPH()] }] }),
    tableCell: () => ({ type: 'tableCell', content: [PARAGRAPH()] }),
    tableHeader: () => ({ type: 'tableHeader', content: [PARAGRAPH()] }),
    spoiler: () => ({ type: 'spoiler', attrs: { title: '剧透内容', open: false }, content: [PARAGRAPH()] }),
    video: () => ({ type: 'video', attrs: { provider: 'bilibili', videoId: 'BV1xx411c7mD', title: '' } }),
    attachment: () => ({ type: 'attachment', attrs: { attachmentId: 1 } }),
    postQuote: () => ({ type: 'postQuote', attrs: { postId: 1 } }),
    replyQuote: () => ({ type: 'replyQuote', attrs: { postId: 1, replyId: 2 } }),
    image: () => ({ type: 'image', attrs: { src: 'https://cdn.example.org/x.png', alt: 'x' } }),
    mention: () => ({ type: 'mention', attrs: { userId: 1, username: 'alice' } }),
    customEmoji: () => ({ type: 'customEmoji', attrs: { id: 1, name: 'emoji', shortcode: 'sun' } }),
    hardBreak: () => ({ type: 'hardBreak' }),
  };
  /** Each sample wrapped so it sits where the API accepts it. */
  const WRAPPERS: Record<string, (node: Record<string, unknown>) => Record<string, unknown>> = {
    bulletList: (n) => n, orderedList: (n) => n, blockquote: (n) => n, table: (n) => n, taskList: (n) => n,
    paragraph: (n) => n, heading: (n) => n, codeBlock: (n) => n, horizontalRule: (n) => n, spoiler: (n) => n,
    video: (n) => n, attachment: (n) => n, postQuote: (n) => n, replyQuote: (n) => n,
    listItem: (n) => ({ type: 'bulletList', content: [n] }),
    taskItem: (n) => ({ type: 'taskList', content: [n] }),
    tableRow: (n) => ({ type: 'table', content: [n] }),
    tableCell: (n) => ({ type: 'table', content: [{ type: 'tableRow', content: [n] }] }),
    tableHeader: (n) => ({ type: 'table', content: [{ type: 'tableRow', content: [n] }] }),
    image: (n) => ({ type: 'paragraph', content: [n] }),
    mention: (n) => ({ type: 'paragraph', content: [n] }),
    customEmoji: (n) => ({ type: 'paragraph', content: [n] }),
    hardBreak: (n) => ({ type: 'paragraph', content: [n] }),
  };

  /** Runs inside a JSDOM window, since `getSchema` needs a DOM to build the schema. */
  function inDom<T>(run: (dom: JSDOM) => T): T {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    const globals = globalThis as any;
    const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'DOMParser', 'getSelection'];
    const original: Record<string, unknown> = {};
    for (const key of keys) original[key] = globals[key];
    Object.assign(globals, {
      window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
      Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, DOMParser: dom.window.DOMParser,
      getSelection: dom.window.getSelection.bind(dom.window),
    });
    Object.defineProperty(globals, 'navigator', { configurable: true, value: dom.window.navigator });
    try {
      return run(dom);
    } finally {
      dom.window.close();
      for (const key of keys) {
        if (key === 'navigator') Object.defineProperty(globals, key, { configurable: true, value: original[key] });
        else globals[key] = original[key];
      }
    }
  }

  /**
   * `contentMatch.matchType` only looks at the *first* position, so `paragraph
   * block*` looks like it forbids a spoiler when it merely requires one paragraph
   * first. Walk forward through valid prefixes instead: if the child matches
   * after some prefix the expression allows, the editor can really produce it.
   */
  const BLOCK_PREFIXES = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList',
    'codeBlock', 'horizontalRule', 'table', 'spoiler', 'video', 'attachment', 'postQuote', 'replyQuote'];

  function allowsChild(schema: ReturnType<typeof getSchema>, parent: string, child: string): boolean {
    let match = schema.nodes[parent].contentMatch;
    for (let depth = 0; depth < 4; depth += 1) {
      if (match.matchType(schema.nodes[child])) return true;
      const next = BLOCK_PREFIXES.map((name) => match.matchType(schema.nodes[name])).find(Boolean);
      if (!next) return false;
      match = next;
    }
    return false;
  }

  /** Doc for a parent/child pair: the child goes after whatever the parent requires first. */
  function nestedDocument(parent: string, child: string): Record<string, unknown> {
    const childNode = SAMPLES[child]();
    const leading = ['listItem', 'taskItem'].includes(parent) ? [PARAGRAPH()] : [];
    return { type: 'doc', content: [WRAPPERS[parent]({ ...SAMPLES[parent](), content: [...leading, childNode] })] };
  }

  const accepts = (document: Record<string, unknown>) => {
    try {
      normalizeTiptapDocument(document, { schemaVersion: 2, allowDraftAttachments: true });
      return true;
    } catch {
      return false;
    }
  };

  it('rejects the combinations the toolbar could otherwise produce', () => {
    // The four shapes that used to slip through: each is reachable from a toolbar
    // button, and each was rejected by the API with INVALID_CONTENT_JSON.
    const rejected: Array<[string, Record<string, unknown>]> = [
      ['spoiler in listItem', { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [PARAGRAPH(), SAMPLES.spoiler()] }] }] }],
      ['spoiler in tableCell', { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [PARAGRAPH(), SAMPLES.spoiler()] }] }] }] }],
      ['nested spoiler', { type: 'doc', content: [SAMPLES.spoiler(), SAMPLES.spoiler()].map((node, index) => index ? { ...node, content: [PARAGRAPH(), SAMPLES.spoiler()] } : node) } as any],
      ['video in blockquote', { type: 'doc', content: [{ type: 'blockquote', content: [SAMPLES.video()] }] }],
      ['attachment in blockquote', { type: 'doc', content: [{ type: 'blockquote', content: [SAMPLES.attachment()] }] }],
      ['postQuote in blockquote', { type: 'doc', content: [{ type: 'blockquote', content: [SAMPLES.postQuote()] }] }],
    ];
    for (const [name, document] of rejected) {
      expect([name, accepts(document)]).toEqual([name, false]);
    }
  });

  it('keeps every parent/child pair the editor schema allows legal for the API', () => {
    inDom((dom) => {
      const schema = getSchema(createTiptapEditorExtensions(''));
      const violations: string[] = [];
      for (const parent of Object.keys(schema.nodes)) {
        if (parent === 'doc' || parent === 'text') continue;
        if (!SAMPLES[parent]) continue;
        for (const child of Object.keys(schema.nodes)) {
          if (!SAMPLES[child] || !allowsChild(schema, parent, child)) continue;
          if (!accepts(nestedDocument(parent, child))) violations.push(`${parent} > ${child}`);
        }
      }
      expect(violations).toEqual([]);
      void dom;
    });
  });

  it('lets the editor keep every legal parent/child pair instead of dropping nodes on load', () => {
    inDom((dom) => {
      const schema = getSchema(createTiptapEditorExtensions(''));
      const lost: string[] = [];
      for (const parent of Object.keys(schema.nodes)) {
        if (parent === 'doc' || parent === 'text' || !SAMPLES[parent]) continue;
        for (const child of Object.keys(schema.nodes)) {
          if (!SAMPLES[child] || !allowsChild(schema, parent, child)) continue;
          const document = nestedDocument(parent, child);
          if (!accepts(document)) continue;
          const editor = new Editor({
            element: dom.window.document.createElement('div'),
            extensions: createTiptapEditorExtensions(''),
            content: document as never,
          });
          const kept = JSON.stringify(editor.getJSON()).includes(`"${child}"`);
          editor.destroy();
          if (!kept) lost.push(`${parent} > ${child}`);
        }
      }
      expect(lost).toEqual([]);
    });
  });

  it('shares one column layout between the editor and the reader', () => {
    const table = { type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', attrs: { colwidth: [200] }, content: [PARAGRAPH()] },
      { type: 'tableCell', attrs: { colwidth: [300] }, content: [PARAGRAPH()] },
    ] }] };
    expect(richTableLayout(table)).toEqual({ columns: [200, 300], width: '500px' });
    // No colwidth: no explicit width, so the reader's stylesheet min-width governs.
    const fluid = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [PARAGRAPH()] }] }] };
    expect(richTableLayout(fluid)).toEqual({ columns: [null], width: undefined });
  });
});
