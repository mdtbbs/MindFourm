import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RichCardNodeView } from '@/components/rich-content/rich-node-views';
import { FONT_SIZES, FONT_STACKS, HIGHLIGHT_COLORS, cssStyle, textColorStyle, highlightStyle, fontSizeStyle, fontFamilyStyle } from './presentation';
import { Plugin } from '@tiptap/pm/state';

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
  content: 'paragraph block*',
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
  content: 'block+',
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

export const RichPasteSanitizer = Extension.create({
  name: 'richPasteSanitizer',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        transformPastedHTML(html) {
          if (typeof DOMParser === 'undefined') return '';
          const document = new DOMParser().parseFromString(html, 'text/html');
          document.querySelectorAll('script,style,iframe,object,embed,form,svg,math').forEach((element) => element.remove());
          const colors = new Map([['#fff2cc', 'yellow'], ['#d9ead3', 'green'], ['#cfe2f3', 'blue'], ['#f4cccc', 'pink'], ['#fce5cd', 'orange']]);
          for (const element of Array.from(document.body.querySelectorAll('*'))) {
            for (const attribute of Array.from(element.attributes)) {
              if (attribute.name.toLowerCase().startsWith('on') || ['id', 'class'].includes(attribute.name.toLowerCase())) element.removeAttribute(attribute.name);
            }
            const style = element.getAttribute('style');
            if (!style) continue;
            let color: string | null = null;
            let highlight: string | null = null;
            let fontSize: string | null = null;
            for (const declaration of style.split(';')) {
              const separator = declaration.indexOf(':');
              if (separator < 0) continue;
              const property = declaration.slice(0, separator).trim().toLowerCase();
              const value = declaration.slice(separator + 1).trim().toLowerCase();
              if (property === 'color') {
                const hex = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value.toUpperCase() : null;
                const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
                color = hex || (rgb && rgb.slice(1).every((part) => Number(part) <= 255) ? '#' + rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase() : null);
              }
              if (property === 'background-color') {
                const background = value.replace(/\s/g, '');
                highlight = colors.get(background) || colors.get(background.toLowerCase()) || null;
              }
              if (property === 'font-size') {
                const match = /^(\d+(?:\.\d+)?)(px|pt)$/.exec(value);
                if (match) {
                  const px = Math.round(Number(match[1]) * (match[2] === 'pt' ? 4 / 3 : 1));
                  if (FONT_SIZES.includes(px)) fontSize = px + 'px';
                }
              }
            }
            element.removeAttribute('style');
            if (color && element.tagName.toLowerCase() === 'span') element.setAttribute('data-color', color);
            if (highlight && element.tagName.toLowerCase() === 'span') element.setAttribute('data-highlight', highlight);
            if (fontSize && element.tagName.toLowerCase() === 'span') element.setAttribute('data-font-size', fontSize);
          }
          return document.body.innerHTML;
        },
      },
    })];
  },
});

export const RICH_CONTENT_EXTENSIONS = [
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
  RichPasteSanitizer,
];

export const richContentEditorDefaults = {
  fontSizes: FONT_SIZES,
  fontFamilies: FONT_FAMILIES,
  highlights: HIGHLIGHTS,
};
