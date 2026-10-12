import { markPasteRule, mergeAttributes } from '@tiptap/core';
import { richTableLayout } from './table-presentation';
import { PresentedTableView } from './table-view';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import ImageExt from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import LinkExt from '@tiptap/extension-link';
import UnderlineExt from '@tiptap/extension-underline';
import CharacterCount from '@tiptap/extension-character-count';
import { Table as TableExtension } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import BulletListExt from '@tiptap/extension-bullet-list';
import OrderedListExt from '@tiptap/extension-ordered-list';
import ListItemExt from '@tiptap/extension-list-item';
import BlockquoteExt from '@tiptap/extension-blockquote';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { richContentLowlight } from './syntax-highlight';
import { RICH_CONTENT_EXTENSIONS } from './rich-content-extensions';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { MarkType } from '@tiptap/pm/model';
import { normalizeEditorLink } from './editor-link';
import { findPlausibleLinks, MAX_LINKIFY_RUN } from './link-autolink';
import { BLOCKQUOTE_BLOCKS, CONTAINER_BLOCKS, blockContent, positiveBlockContent } from './schema-content';

/**
 * The stock `link` extension scans for links without any bound, which turns a
 * paste of one long unbroken run into a frozen tab (see `link-autolink.ts`).
 *
 * Two changes, both keeping the behaviour a user can observe:
 *
 *  - The paste rule only looks at runs short enough to *be* a link. Long runs
 *    gain nothing from the scan: their length is already far past the URL limit
 *    the rest of the editor enforces.
 *  - The autolink plugin skips a transaction that came from a paste. The paste
 *    rule above already handled the pasted text, so rescanning the whole
 *    inserted range costs the most and adds nothing.
 *
 * Typing is untouched: a URL followed by a space still becomes a link, and a
 * pasted lone URL still becomes one through the paste rule.
 */
const AUTOLINK_PLUGIN_PREFIX = 'autolink$';

const BoundedLink = LinkExt.extend({
  addPasteRules() {
    const isAllowedUri = this.options.isAllowedUri;
    const context = { protocols: this.options.protocols, defaultProtocol: this.options.defaultProtocol };
    return [markPasteRule({
      find: ((text: string) => findPlausibleLinks(text)
        .filter((item) => isAllowedUri(item.href, { ...context, defaultValidate: () => true }))
        .map((item) => ({ text: item.text, data: { href: item.href }, index: item.index }))) as never,
      type: this.type,
      getAttributes: (match: { data?: { href?: string } }) => ({ href: match.data?.href }),
    })];
  },
  addProseMirrorPlugins() {
    const stock = (this.parent?.() ?? []) as Array<{ key?: string }>;
    const kept = stock.filter((plugin) => typeof plugin.key !== 'string' || !plugin.key.startsWith(AUTOLINK_PLUGIN_PREFIX));
    if (!this.options.autolink) return kept as never;
    kept.push(autolinkFromTyping(this.type) as never);
    return kept as never;
  },
});

/** Autolink for the text just typed; bounded, and never run over a pasted range. */
function autolinkFromTyping(linkType: MarkType) {
  return new Plugin({
    key: new PluginKey('autolink'),
    appendTransaction: (transactions: readonly Transaction[], oldState: EditorState, newState: EditorState) => {
      const docChanges = transactions.some((transaction) => transaction.docChanged) && !oldState.doc.eq(newState.doc);
      if (!docChanges) return;
      if (transactions.some((transaction) => transaction.getMeta('preventAutolink'))) return;
      // A paste brings its own markup and is already covered by the paste rule;
      // scanning the inserted range is what makes this quadratic.
      if (transactions.some((transaction) => transaction.getMeta('paste'))) return;
      const { $from } = newState.selection;
      if (!$from.parent.isTextblock) return;
      const to = newState.selection.from;
      const from = Math.max($from.start() + 1, to - MAX_LINKIFY_RUN);
      const text = newState.doc.textBetween(from, to, ' ', ' ');
      const word = text.split(/\s+/).filter(Boolean).pop();
      if (!word || word.length > MAX_LINKIFY_RUN) return;
      const link = findPlausibleLinks(word).find((item) => item.text === word);
      if (!link || normalizeEditorLink(link.href) === null) return;
      const tr = newState.tr.addMark(from + text.lastIndexOf(word), to, linkType.create({ href: link.href }));
      return tr.steps.length ? tr : undefined;
    },
  });
}


const TightBulletList = BulletListExt.extend({
  addAttributes() {
    return { ...this.parent?.(), tight: { default: true, rendered: false } };
  },
});

const TightOrderedList = OrderedListExt.extend({
  addAttributes() {
    const types = ['1', 'a', 'A', 'i', 'I'];
    return {
      ...this.parent?.(), tight: { default: true, rendered: false },
      type: { default: null,
        parseHTML: (element) => types.includes(element.getAttribute('type') || '') ? element.getAttribute('type') : null,
        renderHTML: ({ type }) => types.includes(type) ? { type } : {},
      },
    };
  },
});

/**
 * Keep the editor no wider than the schema the API validates.
 *
 * Tiptap's stock `listItem` / `blockquote` / table cells accept a whole `block+`,
 * so the toolbar can produce documents `normalizeTiptapDocument` rejects — see
 * `schema-content.ts`. Narrowing the content expressions here is what stops the
 * editor from *creating* them, rather than failing the publish afterwards.
 */
const TightListItem = ListItemExt.extend({ content: 'paragraph ' + blockContent(CONTAINER_BLOCKS) + '*' });
const TightBlockquote = BlockquoteExt.extend({ content: positiveBlockContent(BLOCKQUOTE_BLOCKS) });

const PresentedTable = TableExtension.extend({
  addNodeView() {
    return ({ node, HTMLAttributes }) => new PresentedTableView(node, HTMLAttributes) as never;
  },
  renderHTML({ node, HTMLAttributes }) {
    const layout = richTableLayout(node.toJSON());
    return ['div', { class: 'tableWrapper' }, ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, layout.width ? { style: `width: ${layout.width}` } : {}),
      ['colgroup', {}, ...layout.columns.map((width) => ['col', width ? { style: `width: ${width}px` } : {}])], ['tbody', 0]]];
  },
});

const CELL_ALIGNMENTS = ['left', 'center', 'right'];
/**
 * `data-align` is the canonical marker (the API validates it and the reader
 * renders it), but Word and web pages only ship `style="text-align: …"`, so a
 * paste has to be readable from either.
 */
const cellAlignAttribute = () => ({
  default: null,
  parseHTML: (element: HTMLElement) => {
    const marker = (element.getAttribute('data-align') || '').toLowerCase();
    return CELL_ALIGNMENTS.includes(marker) ? marker
      : CELL_ALIGNMENTS.includes(element.style.textAlign) ? element.style.textAlign : null;
  },
  renderHTML: ({ align }: { align: string | null }) => align && CELL_ALIGNMENTS.includes(align) ? { style: `text-align: ${align}` } : {},
});
const AlignedTableCell = TableCell.extend({
  content: positiveBlockContent(CONTAINER_BLOCKS),
  addAttributes() { return { ...this.parent?.(), align: cellAlignAttribute() }; },
});
const AlignedTableHeader = TableHeader.extend({
  content: positiveBlockContent(CONTAINER_BLOCKS),
  addAttributes() { return { ...this.parent?.(), align: cellAlignAttribute() }; },
});
const SizedImage = ImageExt.extend({
  addAttributes() {
    const dimension = {
      default: null,
      renderHTML: (attributes: Record<string, any>) => Object.fromEntries(['width', 'height'].filter((key) => Number.isSafeInteger(attributes[key]) && attributes[key] > 0 && attributes[key] <= 4096).map((key) => [key, attributes[key]])),
    };
    return { ...this.parent?.(), width: { ...dimension, parseHTML: (element) => Number(element.getAttribute('width')) || null }, height: { ...dimension, parseHTML: (element) => Number(element.getAttribute('height')) || null } };
  },
});

/** The single extension set used by the production editor and the schema contract test. */
export function createTiptapEditorExtensions(placeholder = '') {
  return [
    StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, underline: false, listItem: false, blockquote: false }),
    TightBulletList,
    TightOrderedList,
    TightListItem,
    TightBlockquote,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
    SizedImage.configure({ inline: true, allowBase64: false }),
    Placeholder.configure({ placeholder }),
    BoundedLink.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'editor-link' },
      isAllowedUri: (url) => normalizeEditorLink(url) !== null,
    }),
    UnderlineExt,
    CharacterCount,
    PresentedTable.configure({ resizable: false, renderWrapper: true }),
    TableRow,
    AlignedTableCell,
    AlignedTableHeader,
    CodeBlockLowlight.configure({ lowlight: richContentLowlight }),
    ...RICH_CONTENT_EXTENSIONS,
  ];
}
