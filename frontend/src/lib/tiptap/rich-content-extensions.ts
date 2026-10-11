import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RichCardNodeView, RichHtmlBlockNodeView } from '@/components/rich-content/rich-node-views';
import { BLOCK_ALIGNMENTS, FONT_SIZES, FONT_STACKS, HIGHLIGHT_COLORS, blockAlignStyle, cssStyle, textColorStyle, highlightStyle, fontSizeStyle, fontFamilyStyle } from './presentation';
import { CONTAINER_BLOCKS, blockContent, positiveBlockContent } from './schema-content';
import { Plugin } from '@tiptap/pm/state';
import { normalizePastedRichHtml } from './paste-normalization';

const HIGHLIGHTS = Object.keys(HIGHLIGHT_COLORS);
const FONT_FAMILIES = Object.keys(FONT_STACKS);

export const TextColor = Mark.create({
  name: 'textColor',
  addAttributes() { return { color: { default: '#000000' } }; },
  parseHTML() { return [{ tag: 'span[data-color]', getAttrs: (el) => ({ color: (el as HTMLElement).dataset.color }) }]; },
  renderHTML({ HTMLAttributes }) { return ['span', { 'data-color': HTMLAttributes.color, style: cssStyle(textColorStyle(HTMLAttributes.color)) }, 0]; },
});

export const TextHighlight = Mark.create({
  name: 'highlight',
  addAttributes() { return { color: { default: 'yellow' } }; },
  parseHTML() { return [{ tag: 'span[data-highlight]', getAttrs: (el) => ({ color: (el as HTMLElement).dataset.highlight }) }]; },
  renderHTML({ HTMLAttributes }) { return ['span', { 'data-highlight': HTMLAttributes.color, style: cssStyle(highlightStyle(HTMLAttributes.color)) }, 0]; },
});

export const FontSize = Mark.create({
  name: 'fontSize',
  addAttributes() { return { size: { default: '16px' } }; },
  parseHTML() { return [{ tag: 'span[data-font-size]', getAttrs: (el) => ({ size: (el as HTMLElement).dataset.fontSize }) }]; },
  renderHTML({ HTMLAttributes }) { return ['span', { 'data-font-size': HTMLAttributes.size, style: cssStyle(fontSizeStyle(HTMLAttributes.size)) }, 0]; },
});

export const FontFamily = Mark.create({
  name: 'fontFamily',
  addAttributes() { return { family: { default: 'default' } }; },
  parseHTML() { return [{ tag: 'span[data-font-family]', getAttrs: (el) => ({ family: (el as HTMLElement).dataset.fontFamily }) }]; },
  renderHTML({ HTMLAttributes }) { return ['span', { 'data-font-family': HTMLAttributes.family, style: cssStyle(fontFamilyStyle(HTMLAttributes.family)) }, 0]; },
});

export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML() { return [{ tag: 'sup' }]; },
  renderHTML() { return ['sup', 0]; },
});

export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML() { return [{ tag: 'sub' }]; },
  renderHTML() { return ['sub', 0]; },
});

export const TaskList = Node.create({
  name: 'taskList',
  group: 'block',
  content: 'taskItem+',
  parseHTML() { return [{ tag: 'ul[data-task-list]' }]; },
  renderHTML({ HTMLAttributes }) { return ['ul', mergeAttributes(HTMLAttributes, { 'data-task-list': 'true' }), 0]; },
});

export const TaskItem = Node.create({
  name: 'taskItem',
  content: 'paragraph ' + blockContent(CONTAINER_BLOCKS) + '*',
  defining: true,
  addAttributes() { return { checked: { default: false } }; },
  parseHTML() {
    return [{
      tag: 'li[data-task-item]',
      getAttrs: (element) => ({ checked: (element as HTMLElement).dataset.checked === 'true' }),
    }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['li', mergeAttributes(HTMLAttributes, { 'data-task-item': 'true', 'data-checked': String(Boolean(node.attrs.checked)) }), [
      'input',
      { type: 'checkbox', 'data-task-checkbox': 'true', checked: Boolean(node.attrs.checked) ? 'checked' : null, contenteditable: 'false' },
    ], ['div', { 'data-task-content': 'true' }, 0]];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        handleClick(view, _position, event) {
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches('input[data-task-checkbox]')) return false;
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coordinates) return false;
          const $position = view.state.doc.resolve(coordinates.pos);
          for (let depth = $position.depth; depth > 0; depth -= 1) {
            const node = $position.node(depth);
            if (node.type.name !== 'taskItem') continue;
            const position = $position.before(depth);
            view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, checked: !node.attrs.checked }));
            return true;
          }
          return false;
        },
      },
    })];
  },
});

export const Spoiler = Node.create({
  name: 'spoiler',
  group: 'block',
  // No nested spoiler: the API rejects it, and the editor should not build it.
  content: positiveBlockContent(CONTAINER_BLOCKS),
  defining: true,
  addAttributes() { return { title: { default: '剧透内容' }, open: { default: false } }; },
  parseHTML() {
    return [{
      tag: 'details[data-type="spoiler"]',
      getAttrs: (element) => ({
        title: (element.querySelector('summary')?.textContent || '剧透内容').slice(0, 120),
        open: (element as HTMLDetailsElement).open,
      }),
    }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes, { 'data-type': 'spoiler', open: node.attrs.open ? 'open' : null }), [
      'summary', { 'data-spoiler-summary': 'true' }, String(node.attrs.title || '剧透内容'),
    ], ['div', { 'data-spoiler-content': 'true' }, 0]];
  },
});

export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() { return { userId: { default: null }, username: { default: '' } }; },
  parseHTML() { return [{ tag: 'a[data-mention-user-id]', getAttrs: (el) => ({ userId: Number((el as HTMLElement).dataset.mentionUserId), username: (el as HTMLElement).textContent?.replace(/^@/, '') || '' }) }]; },
  renderHTML({ node }) {
    return ['a', { href: '/users/' + node.attrs.userId, 'data-mention-user-id': node.attrs.userId, class: 'rich-mention', contenteditable: 'false' }, '@' + node.attrs.username];
  },
});

export const CustomEmoji = Node.create({
  name: 'customEmoji',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() { return { id: { default: null }, name: { default: '' }, shortcode: { default: '' } }; },
  parseHTML() { return [{ tag: 'img[data-custom-emoji-id]', getAttrs: (el) => ({ id: Number((el as HTMLImageElement).dataset.customEmojiId), name: (el as HTMLImageElement).title, shortcode: ((el as HTMLImageElement).alt || '').replace(/^:|:$/g, '') }) }]; },
  renderHTML({ node }) {
    return ['img', {
      src: '/api/custom-emojis/' + node.attrs.id + '/image',
      'data-custom-emoji-id': node.attrs.id,
      alt: ':' + node.attrs.shortcode + ':',
      title: node.attrs.name,
      contenteditable: 'false',
      class: 'rich-custom-emoji',
    }];
  },
});

export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  addNodeView() { return ReactNodeViewRenderer(RichCardNodeView); },
  addAttributes() { return { provider: { default: 'direct' }, videoId: { default: null }, src: { default: null }, title: { default: '' } }; },
  parseHTML() {
    return [{
      tag: '[data-rich-video-provider]',
      getAttrs: (el) => ({
        provider: (el as HTMLElement).dataset.richVideoProvider,
        videoId: (el as HTMLElement).dataset.richVideoId || null,
        src: (el as HTMLElement).dataset.richVideoSrc || null,
        title: (el as HTMLElement).dataset.richVideoTitle || '',
      }),
    }];
  },
  renderHTML({ node }) {
    const attrs = {
      'data-rich-video-provider': node.attrs.provider,
      ...(node.attrs.videoId ? { 'data-rich-video-id': node.attrs.videoId } : {}),
      ...(node.attrs.src ? { 'data-rich-video-src': node.attrs.src } : {}),
      'data-rich-video-title': node.attrs.title || '',
      contenteditable: 'false',
    };
    return ['div', attrs, ['span', { 'aria-hidden': 'true' }, '▶'], ' ', String(node.attrs.title || (node.attrs.provider + ' 视频'))];
  },
});

export const AttachmentCard = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  addNodeView() { return ReactNodeViewRenderer(RichCardNodeView); },
  addAttributes() { return { attachmentId: { default: null }, draftToken: { default: null } }; },
  parseHTML() { return [{ tag: '[data-rich-attachment]', getAttrs: (el) => ({ attachmentId: Number((el as HTMLElement).dataset.attachmentId) || null, draftToken: (el as HTMLElement).dataset.draftToken || null }) }]; },
  renderHTML({ node }) {
    return ['div', {
      'data-rich-attachment': 'true',
      ...(node.attrs.attachmentId ? { 'data-attachment-id': node.attrs.attachmentId } : {}),
      ...(node.attrs.draftToken ? { 'data-draft-token': node.attrs.draftToken } : {}),
      contenteditable: 'false',
    }, '附件：' + (node.attrs.attachmentId ? ('#' + node.attrs.attachmentId) : '待发布文件')];
  },
});

export const PostQuote = Node.create({
  name: 'postQuote',
  group: 'block',
  atom: true,
  addNodeView() { return ReactNodeViewRenderer(RichCardNodeView); },
  addAttributes() { return { postId: { default: null } }; },
  parseHTML() { return [{ tag: 'aside[data-quote-type="post"]', getAttrs: (el) => ({ postId: Number((el as HTMLElement).querySelector('a')?.href.match(/\/posts\/(\d+)/)?.[1]) || null }) }]; },
  renderHTML({ node }) { return ['aside', { 'data-quote-type': 'post', 'data-post-id': node.attrs.postId, contenteditable: 'false' }, ['a', { href: '/posts/' + node.attrs.postId }, '引用帖子 #' + node.attrs.postId]]; },
});

export const ReplyQuote = Node.create({
  name: 'replyQuote',
  group: 'block',
  atom: true,
  addNodeView() { return ReactNodeViewRenderer(RichCardNodeView); },
  addAttributes() { return { postId: { default: null }, replyId: { default: null } }; },
  parseHTML() {
    return [{
      tag: 'aside[data-quote-type="reply"]',
      getAttrs: (el) => ({ postId: Number((el as HTMLElement).dataset.postId) || null, replyId: Number((el as HTMLElement).dataset.replyId) || null }),
    }];
  },
  renderHTML({ node }) {
    return ['aside', { 'data-quote-type': 'reply', 'data-post-id': node.attrs.postId, 'data-reply-id': node.attrs.replyId, contenteditable: 'false' }, [
      'a', { href: '/posts/' + node.attrs.postId + '#reply-' + node.attrs.replyId }, '引用回复 #' + node.attrs.replyId,
    ]];
  },
});

/**
 * Block alignment for `paragraph` and `heading`, mirroring the `align` attribute
 * table cells already carry. `data-align` is the canonical marker on both ends;
 * the API rejects any value outside `BLOCK_ALIGNMENTS`.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockAlign: {
      /** Sets (or with `null` clears) the alignment of the current text block. */
      setBlockAlign: (align: string | null) => ReturnType;
    };
  }
}

export const BlockAlign = Extension.create({
  name: 'blockAlign',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        align: {
          default: null,
          parseHTML: (element) => {
            const direct = (element.getAttribute('data-align') || '').toLowerCase();
            const style = (element.style?.textAlign || '').toLowerCase();
            return (BLOCK_ALIGNMENTS as readonly string[]).includes(direct) ? direct
              : (BLOCK_ALIGNMENTS as readonly string[]).includes(style) ? style : null;
          },
          renderHTML: (attributes) => (BLOCK_ALIGNMENTS as readonly string[]).includes(attributes.align)
            ? { 'data-align': attributes.align, style: cssStyle(blockAlignStyle(attributes.align)) }
            : {},
        },
      },
    }];
  },
  addCommands() {
    // Only one of the two types is present at the cursor, so the first match wins.
    return {
      setBlockAlign: (align) => ({ commands }) => commands.updateAttributes('paragraph', { align })
        || commands.updateAttributes('heading', { align }),
    };
  },
});

export const RichPasteSanitizer = Extension.create({
  name: 'richPasteSanitizer',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        transformPastedHTML(html) {
          if (typeof DOMParser === 'undefined') return '';
          return normalizePastedRichHtml(html);
        },
      },
    })];
  },
});

/**
 * A staff-authored HTML block.
 *
 * The node is an atom: it holds a sanitized fragment as an attribute rather than
 * as edited content, so ProseMirror never has to understand the markup inside it
 * and the fragment cannot be partially edited into an invalid shape. `addNodeView`
 * shows the rendered result, exactly as a reader sees it, which is the only
 * honest preview for markup the editor does not model.
 *
 * Whether the node may be *used* is a service-side decision (`assertHtmlBlockPermission`);
 * the schema keeps it available so a staff member's document round-trips through
 * an editor session without the block being dropped on load.
 */
export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  atom: true,
  addNodeView() { return ReactNodeViewRenderer(RichHtmlBlockNodeView); },
  addAttributes() {
    return { html: { default: '' } };
  },
  parseHTML() {
    return [{
      tag: 'div[data-rich-html-block]',
      getAttrs: (element) => ({ html: (element as HTMLElement).getAttribute('data-html') || '' }),
    }];
  },
  renderHTML({ node }) {
    // The stored form keeps the fragment in an attribute: it is data, not the
    // node's content, so nothing downstream reads it as markup.
    return ['div', { 'data-rich-html-block': 'true', 'data-html': node.attrs.html, contenteditable: 'false' }];
  },
});

export const RICH_CONTENT_EXTENSIONS = [
  BlockAlign,
  TextColor,
  TextHighlight,
  FontSize,
  FontFamily,
  Superscript,
  Subscript,
  TaskList,
  TaskItem,
  Spoiler,
  Mention,
  CustomEmoji,
  Video,
  AttachmentCard,
  PostQuote,
  ReplyQuote,
  HtmlBlock,
  RichPasteSanitizer,
];

export const richContentEditorDefaults = {
  fontSizes: FONT_SIZES,
  fontFamilies: FONT_FAMILIES,
  highlights: HIGHLIGHTS,
};
