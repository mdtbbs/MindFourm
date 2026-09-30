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
import { common, createLowlight } from 'lowlight';
import { RICH_CONTENT_EXTENSIONS } from './rich-content-extensions';

const TightBulletList = BulletListExt.extend({
  addAttributes() {
    return { ...this.parent?.(), tight: { default: true, rendered: false } };
  },
});

const TightOrderedList = OrderedListExt.extend({
  addAttributes() {
    return { ...this.parent?.(), tight: { default: true, rendered: false } };
  },
});

/** The single extension set used by the production editor and the schema contract test. */
export function createTiptapEditorExtensions(placeholder = '') {
  return [
    StarterKit.configure({ codeBlock: false, link: false, bulletList: false, orderedList: false, underline: false }),
    TightBulletList,
    TightOrderedList,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
    ImageExt.configure({ inline: true, allowBase64: false }),
    Placeholder.configure({ placeholder }),
    LinkExt.configure({ openOnClick: false, HTMLAttributes: { class: 'editor-link' } }),
    UnderlineExt,
    CharacterCount,
    TableExtension.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    CodeBlockLowlight.configure({ lowlight: createLowlight(common) }),
    ...RICH_CONTENT_EXTENSIONS,
  ];
}
