import { mergeAttributes } from '@tiptap/core';
import { richTableLayout } from './table-presentation';
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
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { richContentLowlight } from './syntax-highlight';
import { RICH_CONTENT_EXTENSIONS } from './rich-content-extensions';
import { normalizeEditorLink } from './editor-link';

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

const PresentedTable = TableExtension.extend({
  renderHTML({ node, HTMLAttributes }) {
    const layout = richTableLayout(node.toJSON());
    return ['div', { class: 'tableWrapper' }, ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, layout.width ? { style: `width: ${layout.width}` } : {}),
      ['colgroup', {}, ...layout.columns.map((width) => ['col', width ? { style: `width: ${width}px` } : {}])], ['tbody', 0]]];
  },
});

const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), align: { default: null,
      parseHTML: (element) => ['left', 'center', 'right'].includes(element.style.textAlign) ? element.style.textAlign : null,
      renderHTML: ({ align }) => ['left', 'center', 'right'].includes(align) ? { style: `text-align: ${align}` } : {},
    } };
  },
});
const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), align: { default: null,
      parseHTML: (element) => ['left', 'center', 'right'].includes(element.style.textAlign) ? element.style.textAlign : null,
      renderHTML: ({ align }) => ['left', 'center', 'right'].includes(align) ? { style: `text-align: ${align}` } : {},
    } };
  },
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
    StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, underline: false }),
    TightBulletList,
    TightOrderedList,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
    SizedImage.configure({ inline: true, allowBase64: false }),
    Placeholder.configure({ placeholder }),
    LinkExt.configure({
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
