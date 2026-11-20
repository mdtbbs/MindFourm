/**
 * The resourceEmbed node is a schema contract: what it accepts, what it
 * serializes, and what it refuses to create. The React node view is mocked out
 * because these assertions are about the ProseMirror node, not presentation.
 */
jest.mock('@/components/rich-content/rich-node-views', () => ({
  ResourceEmbedNodeView: () => null,
  RichCardNodeView: () => null,
  RichHtmlBlockNodeView: () => null,
}));

import { Editor, generateHTML, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  ResourceEmbed,
  countResourceEmbedNodes,
  parseSchematicPaste,
  SCHEMATIC_PASTE_MAX_LENGTH,
} from './resource-embed';
import { isValidResourceEmbedAttrs } from '@/lib/api/v1/resource-embeds';
import { projectRichContentToMarkdown } from './rich-content-projection';

const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: { pretendToBeVisual: boolean }) => {
    window: Window & typeof globalThis & { close: () => void };
  };
};

const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

function createSpecDom() {
  return new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function base64(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64');
}

describe('ResourceEmbed node', () => {
  let dom: ReturnType<typeof createSpecDom>;
  let editor: Editor | null = null;
  const globals = globalThis as Record<string, unknown>;
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'DOMParser', 'getSelection', 'ClipboardEvent'];
  const original: Record<string, PropertyDescriptor | undefined> = {};

  beforeAll(() => {
    dom = createSpecDom();
    dom.window.document.body.innerHTML = '<div id="editor"></div>';
    for (const key of keys) original[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: dom.window },
      document: { configurable: true, value: dom.window.document },
      navigator: { configurable: true, value: dom.window.navigator },
      HTMLElement: { configurable: true, value: dom.window.HTMLElement },
      Node: { configurable: true, value: dom.window.Node },
      MutationObserver: { configurable: true, value: dom.window.MutationObserver },
      DOMParser: { configurable: true, value: dom.window.DOMParser },
      getSelection: { configurable: true, value: dom.window.getSelection.bind(dom.window) },
      ClipboardEvent: { configurable: true, value: dom.window.ClipboardEvent || class extends dom.window.Event {} },
    });
    globals.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(callback, 0);
    globals.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
  });

  afterAll(() => {
    editor?.destroy();
    dom.window.close();
    for (const key of keys) {
      const descriptor = original[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globals[key];
    }
  });

  beforeEach(() => {
    editor = new Editor({
      element: dom.window.document.querySelector('#editor') as HTMLElement,
      extensions: [StarterKit, ResourceEmbed],
    });
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('parses the API fallback aside into the node attributes', () => {
    const json = generateJSON(
      `<aside data-resource-embed="${RESOURCE_ID}" data-resource-version="${VERSION_ID}" data-display-mode="card"><a href="/resources/${RESOURCE_ID}">资源卡片</a></aside>`,
      [StarterKit, ResourceEmbed],
    );
    expect(json.content?.[0]).toMatchObject({
      type: 'resourceEmbed',
      attrs: { resourcePublicId: RESOURCE_ID, versionPublicId: VERSION_ID, displayMode: 'card' },
    });
  });

  it('normalizes an unknown display mode instead of carrying it into the schema', () => {
    const json = generateJSON(
      `<aside data-resource-embed="${RESOURCE_ID}" data-display-mode="full"><a href="/resources/${RESOURCE_ID}">资源卡片</a></aside>`,
      [StarterKit, ResourceEmbed],
    );
    expect(json.content?.[0]).toMatchObject({
      type: 'resourceEmbed',
      attrs: { resourcePublicId: RESOURCE_ID, versionPublicId: null, displayMode: 'card' },
    });
  });

  it('serializes back to the same aside shape the API projects', () => {
    const html = generateHTML({
      type: 'doc',
      content: [{ type: 'resourceEmbed', attrs: { resourcePublicId: RESOURCE_ID, versionPublicId: null, displayMode: 'card' } }],
    }, [StarterKit, ResourceEmbed]);
    expect(html).toContain(`data-resource-embed="${RESOURCE_ID}"`);
    expect(html).toContain('data-display-mode="card"');
    expect(html).toContain(`href="/resources/${RESOURCE_ID}"`);
    expect(html).not.toContain('data-resource-version');
  });

  it('allows exactly ten cards and refuses the eleventh', () => {
    for (let index = 0; index < 10; index += 1) {
      // Each inserted atom is selected; move past it before inserting the next
      // one, otherwise `insertContent` replaces the selection.
      editor?.commands.setTextSelection(editor.state.doc.content.size);
      expect(editor?.commands.insertResourceEmbed({ resourcePublicId: uuid(index) })).toBe(true);
    }
    expect(countResourceEmbedNodes(editor!.state.doc)).toBe(10);
    expect(editor?.commands.insertResourceEmbed({ resourcePublicId: uuid(10) })).toBe(false);
    expect(countResourceEmbedNodes(editor!.state.doc)).toBe(10);
  });

  it('rejects malformed ids, versions and display modes without inserting anything', () => {
    expect(editor?.commands.insertResourceEmbed({ resourcePublicId: 'not-a-uuid' })).toBe(false);
    expect(editor?.commands.insertResourceEmbed({ resourcePublicId: RESOURCE_ID, versionPublicId: 'nope' })).toBe(false);
    expect(editor?.commands.insertResourceEmbed({ resourcePublicId: RESOURCE_ID, displayMode: 'full' as never })).toBe(false);
    expect(countResourceEmbedNodes(editor!.state.doc)).toBe(0);
    expect(isValidResourceEmbedAttrs({ resourcePublicId: RESOURCE_ID, versionPublicId: null, displayMode: 'card' })).toBe(true);
  });

  it('projects to the legacy Markdown form without any network access', () => {
    expect(projectRichContentToMarkdown({
      type: 'doc',
      content: [{ type: 'resourceEmbed', attrs: { resourcePublicId: RESOURCE_ID, versionPublicId: null, displayMode: 'card' } }],
    })).toBe(`[资源卡片: ${RESOURCE_ID}]`);
  });
});

describe('parseSchematicPaste', () => {
  const magicAndPayload = [0x6d, 0x73, 0x63, 0x68, ...new Array(120).fill(0x41)];
  const validCode = base64(magicAndPayload);

  it('accepts a Base64 blueprint with the decoded msch header', () => {
    const parsed = parseSchematicPaste(`  ${validCode}\n`);
    expect(parsed).not.toBeNull();
    expect(parsed?.base64).toBe(validCode);
    expect(Array.from(parsed?.bytes.slice(0, 4) || [])).toEqual([0x6d, 0x73, 0x63, 0x68]);
  });

  it('ignores whitespace inside the pasted code', () => {
    expect(parseSchematicPaste(`${validCode.slice(0, 32)}\n${validCode.slice(32)}`)).not.toBeNull();
  });

  it('rejects lookalike prefixes and short payloads', () => {
    expect(parseSchematicPaste(`A${validCode}`)).toBeNull();
    expect(parseSchematicPaste(`bXNja${'A'.repeat(40)}`)).toBeNull();
    expect(parseSchematicPaste('hello world')).toBeNull();
  });

  it('rejects text that only matches the prefix but decodes to another header', () => {
    // `R` makes the fourth decoded byte 0x69, not the `h` of `msch`.
    expect(parseSchematicPaste(`bXNjaR${'A'.repeat(82)}`)).toBeNull();
  });

  it('rejects payloads above the clipboard inspection limit', () => {
    expect(parseSchematicPaste(`bXNja${'A'.repeat(SCHEMATIC_PASTE_MAX_LENGTH)}`)).toBeNull();
  });
});
