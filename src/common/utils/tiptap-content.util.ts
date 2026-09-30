import { HttpStatus } from '@nestjs/common';
import { marked } from 'marked';
import { ApiV1Exception } from '../exceptions/api-v1.exception';
import { sanitize } from './markdown.util';
import { mdtbbsSite, mindustryClubSite } from '../../config/site-profile-data';

export const RICH_CONTENT_SCHEMA_VERSION = 2 as const;
export type TiptapDocument = { type: 'doc'; content: Record<string, unknown>[] };

const BLOCK_NODES = new Set([
  'doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList',
  'listItem', 'taskList', 'taskItem', 'codeBlock', 'horizontalRule', 'table',
  'tableRow', 'tableHeader', 'tableCell', 'spoiler', 'video', 'attachment',
  'postQuote', 'replyQuote',
]);
const INLINE_NODES = new Set(['text', 'hardBreak', 'image', 'mention', 'customEmoji']);
const V2_NODES = new Set(['taskList', 'taskItem', 'spoiler', 'mention', 'customEmoji', 'video', 'attachment', 'postQuote', 'replyQuote']);
const MARKS = new Set(['bold', 'italic', 'strike', 'underline', 'code', 'link', 'textColor', 'highlight', 'fontSize', 'fontFamily', 'superscript', 'subscript']);
const V2_MARKS = new Set(['textColor', 'highlight', 'fontSize', 'fontFamily', 'superscript', 'subscript']);
const MAX_NODES = 5000;
const MAX_TEXT_LENGTH = 500_000;
const FONT_SIZES = new Set([12, 14, 16, 18, 20, 24, 28, 32]);
const FONT_FAMILIES = new Set(['default', 'serif-cn', 'sans-cn', 'kai', 'source-serif-cn', 'source-sans-cn', 'monospace']);
const HIGHLIGHTS = new Set(['yellow', 'green', 'blue', 'pink', 'orange']);
const USERNAME_RE = /^[\p{L}\p{N}_-]{1,64}$/u;
const SHORTCODE_RE = /^[a-z0-9_+-]{1,48}$/;

export class ContentSchemaError extends ApiV1Exception {
  constructor(code: string, message: string, details: Record<string, unknown>) {
    super(code, HttpStatus.BAD_REQUEST, message, false, [details]);
  }
}

function schemaError(code: string, message: string, path: string, node?: string, attribute?: string, schemaVersion: number = RICH_CONTENT_SCHEMA_VERSION): ContentSchemaError {
  return new ContentSchemaError(code, message, {
    ...(node ? { node } : {}),
    ...(attribute ? { attribute } : {}),
    path,
    schema_version: schemaVersion,
  });
}

function invalid(path: string, node?: string, attribute?: string, schemaVersion?: number): never {
  throw schemaError('INVALID_CONTENT_JSON', '正文 JSON 不符合 Rich Content schema', path, node, attribute, schemaVersion);
}

function safeUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\\]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.split('/').includes('..')) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return value;
    if (!image && parsed.protocol === 'mailto:') return value;
  } catch { /* Relative paths are handled above. */ }
  return null;
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return null;
  const hex = value.slice(1);
  const expanded = hex.length <= 4 ? Array.from(hex).map((part) => part + part).join('') : hex;
  return '#' + expanded.toUpperCase();
}

function allowedVideoProviders(): Set<string> {
  const profile = String(process.env.SITE_PROFILE || 'mdtbbs').toLowerCase();
  const configuration = profile === 'mindustry-club' ? mindustryClubSite : mdtbbsSite;
  return new Set(configuration.videoProviders);
}

function strictKeys(source: Record<string, unknown>, allowed: string[], path: string, node: string, version: number): void {
  for (const key of Object.keys(source)) if (!allowed.includes(key)) invalid(path + '.' + key, node, key, version);
}

function normalizeAttrs(type: string, attrs: unknown, path: string, version: number): Record<string, unknown> | undefined {
  if (attrs === undefined) return undefined;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) invalid(path, type, 'attrs', version);
  const source = attrs as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const textAttr = (key: string, max: number, required = false) => {
    const value = source[key];
    if (value === undefined || value === null) {
      if (required) invalid(path + '.' + key, type, key, version);
      return;
    }
    if (typeof value !== 'string' || value.length > max) invalid(path + '.' + key, type, key, version);
    result[key] = value;
  };
  const intAttr = (key: string, min = 1, max = Number.MAX_SAFE_INTEGER) => {
    const value = source[key];
    if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) invalid(path + '.' + key, type, key, version);
    result[key] = Number(value);
  };
  const boolAttr = (key: string, defaultValue?: boolean) => {
    const value = source[key] === undefined ? defaultValue : source[key];
    if (typeof value !== 'boolean') invalid(path + '.' + key, type, key, version);
    result[key] = value;
  };

  switch (type) {
    case 'heading':
      strictKeys(source, ['level'], path, type, version);
      intAttr('level', 1, 6);
      break;
    case 'bulletList':
      strictKeys(source, ['tight'], path, type, version);
      if (source.tight !== undefined) boolAttr('tight');
      break;
    case 'orderedList':
      strictKeys(source, ['start', 'tight', 'type'], path, type, version);
      if (source.start !== undefined && source.start !== null && source.start !== 1) intAttr('start', 1, 100_000);
      if (source.tight !== undefined) boolAttr('tight');
      if (source.type !== undefined && source.type !== null) {
        if (!['1', 'a', 'A', 'i', 'I'].includes(String(source.type))) invalid(path + '.type', type, 'type', version);
        result.type = source.type;
      }
      break;
    case 'taskItem':
      strictKeys(source, ['checked'], path, type, version);
      boolAttr('checked', false);
      break;
    case 'codeBlock':
      strictKeys(source, ['language'], path, type, version);
      if (source.language != null) {
        textAttr('language', 64);
        if (!/^[A-Za-z0-9_+-]+$/.test(String(result.language))) invalid(path + '.language', type, 'language', version);
      }
      break;
    case 'image': {
      strictKeys(source, ['src', 'alt', 'title', 'width', 'height'], path, type, version);
      const src = safeUrl(source.src, true);
      if (!src) invalid(path + '.src', type, 'src', version);
      result.src = src;
      textAttr('alt', 2048);
      textAttr('title', 512);
      for (const key of ['width', 'height']) {
        if (source[key] === undefined || source[key] === null) continue;
        if (!Number.isSafeInteger(source[key]) || Number(source[key]) < 1 || Number(source[key]) > 4096) invalid(path + '.' + key, type, key, version);
        result[key] = Number(source[key]);
      }
      break;
    }
    case 'link': {
      strictKeys(source, ['href', 'title', 'target', 'rel', 'class'], path, type, version);
      const href = safeUrl(source.href);
      if (!href) invalid(path + '.href', type, 'href', version);
      result.href = href;
      textAttr('title', 512);
      if (source.target !== undefined && source.target !== null && source.target !== '_blank') invalid(path + '.target', type, 'target', version);
      if (source.rel !== undefined && source.rel !== null && source.rel !== 'noopener noreferrer nofollow') invalid(path + '.rel', type, 'rel', version);
      if (source.class !== undefined && source.class !== null && source.class !== 'editor-link') invalid(path + '.class', type, 'class', version);
      break;
    }
    case 'tableCell':
    case 'tableHeader':
      strictKeys(source, ['colspan', 'rowspan', 'colwidth', 'scope', 'align'], path, type, version);
      for (const key of ['colspan', 'rowspan']) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== 1) intAttr(key, 1, 100);
      }
      if (source.colwidth !== undefined && source.colwidth !== null) {
        if (!Array.isArray(source.colwidth) || source.colwidth.length > 100
          || source.colwidth.some((width) => width !== null && (!Number.isSafeInteger(width) || Number(width) < 1 || Number(width) > 10_000))) invalid(path + '.colwidth', type, 'colwidth', version);
        result.colwidth = source.colwidth.map((width) => width === null ? null : Number(width));
      }
      if (type === 'tableHeader' && source.scope === 'col') result.scope = 'col';
      else if (source.scope !== undefined && source.scope !== null) invalid(path + '.scope', type, 'scope', version);
      if (source.align !== undefined && source.align !== null) {
        if (!['left', 'center', 'right'].includes(String(source.align))) invalid(path + '.align', type, 'align', version);
        result.align = source.align;
      }
      break;
    case 'spoiler':
      strictKeys(source, ['title', 'open'], path, type, version);
      textAttr('title', 120);
      if (!result.title || !String(result.title).trim()) result.title = '剧透内容';
      boolAttr('open', false);
      break;
    case 'mention':
      strictKeys(source, ['userId', 'username'], path, type, version);
      intAttr('userId');
      textAttr('username', 64, true);
      if (!USERNAME_RE.test(String(result.username))) invalid(path + '.username', type, 'username', version);
      break;
    case 'customEmoji':
      strictKeys(source, ['id', 'name', 'shortcode'], path, type, version);
      intAttr('id');
      textAttr('name', 80, true);
      textAttr('shortcode', 48, true);
      if (!SHORTCODE_RE.test(String(result.shortcode))) invalid(path + '.shortcode', type, 'shortcode', version);
      break;
    case 'video': {
      strictKeys(source, ['provider', 'videoId', 'src', 'title'], path, type, version);
      textAttr('provider', 24, true);
      if (!allowedVideoProviders().has(String(result.provider))) throw schemaError('UNSUPPORTED_VIDEO_PROVIDER', '此站点不支持该视频来源', path + '.provider', type, 'provider', version);
      textAttr('title', 160);
      if (result.provider === 'direct') {
        const src = typeof source.src === 'string' ? source.src : null;
        let parsed: URL | null = null;
        try { if (src) parsed = new URL(src); } catch { parsed = null; }
        if (!parsed || parsed.protocol !== 'https:' || !/\.(?:mp4|webm)$/i.test(parsed.pathname) || parsed.username || parsed.password) invalid(path + '.src', type, 'src', version);
        result.src = parsed.href;
      } else {
        strictKeys(source, ['provider', 'videoId', 'src', 'title'], path, type, version);
        if (source.src !== undefined && source.src !== null) invalid(path + '.src', type, 'src', version);
        textAttr('videoId', 80, true);
        const id = String(result.videoId);
        const valid = result.provider === 'bilibili'
          ? /^(?:BV[0-9A-Za-z]{10}|av[1-9][0-9]{0,14})$/.test(id)
          : result.provider === 'douyin'
            ? /^[0-9]{5,32}$/.test(id)
            : result.provider === 'youtube' ? /^[A-Za-z0-9_-]{11}$/.test(id) : false;
        if (!valid) invalid(path + '.videoId', type, 'videoId', version);
      }
      break;
    }
    case 'attachment':
      strictKeys(source, ['attachmentId', 'draftToken'], path, type, version);
      if (source.attachmentId !== undefined && source.attachmentId !== null) {
        if (source.draftToken !== undefined && source.draftToken !== null) invalid(path, type, 'attrs', version);
        intAttr('attachmentId');
      } else if (source.draftToken !== undefined && source.draftToken !== null) {
        const token = source.draftToken;
        if (typeof token !== 'string' || token.length < 32 || token.length > 200 || !/^[A-Za-z0-9_-]+$/.test(token)) invalid(path + '.draftToken', type, 'draftToken', version);
        result.draftToken = token;
      } else invalid(path, type, 'attrs', version);
      break;
    case 'postQuote':
      strictKeys(source, ['postId'], path, type, version);
      intAttr('postId');
      break;
    case 'replyQuote':
      strictKeys(source, ['postId', 'replyId'], path, type, version);
      intAttr('postId');
      intAttr('replyId');
      break;
    default:
      if (Object.keys(source).length) invalid(path, type, 'attrs', version);
  }
  return Object.keys(result).length ? result : undefined;
}

function childAllowed(parent: string, child: string): boolean {
  if (parent === 'doc') return ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'codeBlock', 'horizontalRule', 'table', 'spoiler', 'video', 'attachment', 'postQuote', 'replyQuote'].includes(child);
  if (parent === 'paragraph' || parent === 'heading') return INLINE_NODES.has(child);
  if (parent === 'blockquote') return ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'codeBlock', 'horizontalRule', 'table', 'spoiler'].includes(child);
  if (['tableCell', 'tableHeader', 'listItem', 'taskItem', 'spoiler'].includes(parent)) return ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'codeBlock', 'horizontalRule', 'table', 'video', 'attachment', 'postQuote', 'replyQuote'].includes(child);
  if (parent === 'bulletList' || parent === 'orderedList') return child === 'listItem';
  if (parent === 'taskList') return child === 'taskItem';
  if (parent === 'codeBlock') return child === 'text';
  if (parent === 'table') return child === 'tableRow';
  if (parent === 'tableRow') return child === 'tableCell' || child === 'tableHeader';
  return false;
}

export interface NormalizeContentOptions {
  schemaVersion?: number;
  resourceDescription?: boolean;
  allowDraftAttachments?: boolean;
}

export function normalizeTiptapDocument(input: unknown, options: NormalizeContentOptions = {}): TiptapDocument {
  const version = options.schemaVersion ?? 1;
  if (!Number.isSafeInteger(version) || version < 1 || version > RICH_CONTENT_SCHEMA_VERSION) throw schemaError('UNSUPPORTED_CONTENT_SCHEMA', '不支持的正文 schema 版本', '$', undefined, undefined, version);
  let nodeCount = 0;
  let textLength = 0;
  const mentions = new Set<number>();
  const visit = (value: unknown, depth: number, path: string, parent?: string, inSpoiler = false): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 32 || ++nodeCount > MAX_NODES) invalid(path, undefined, undefined, version);
    const node = value as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== 'string') invalid(path + '.type', undefined, 'type', version);
    if (!BLOCK_NODES.has(type) && !INLINE_NODES.has(type)) throw schemaError('UNSUPPORTED_CONTENT_NODE', '不支持的正文节点', path + '.type', type, 'type', version);
    if (version < 2 && V2_NODES.has(type)) throw schemaError('UNSUPPORTED_CONTENT_NODE', '此节点需要 Rich Content Schema v2', path + '.type', type, 'type', version);
    if (parent && !childAllowed(parent, type)) invalid(path, type, 'parent', version);
    if (type === 'spoiler' && inSpoiler) invalid(path, type, 'nested spoiler', version);
    strictKeys(node, type === 'text' ? ['type', 'text', 'marks'] : ['type', 'attrs', 'content'], path, type, version);
    const output: Record<string, unknown> = { type };
    if (type === 'text') {
      if (typeof node.text !== 'string') invalid(path + '.text', type, 'text', version);
      textLength += node.text.length;
      if (textLength > MAX_TEXT_LENGTH) invalid(path + '.text', type, 'text', version);
      output.text = node.text;
    }
    if (node.attrs !== undefined) output.attrs = normalizeAttrs(type, node.attrs, path + '.attrs', version);
    if (node.marks !== undefined) {
      if (type !== 'text' || !Array.isArray(node.marks) || node.marks.length > 12) invalid(path + '.marks', type, 'marks', version);
      output.marks = node.marks.map((rawMark, index) => {
        const markPath = path + '.marks[' + index + ']';
        if (!rawMark || typeof rawMark !== 'object' || Array.isArray(rawMark)) invalid(markPath, type, 'marks', version);
        const mark = rawMark as Record<string, unknown>;
        strictKeys(mark, ['type', 'attrs'], markPath, type, version);
        if (typeof mark.type !== 'string' || !MARKS.has(mark.type)) throw schemaError('UNSUPPORTED_CONTENT_MARK', '不支持的正文格式', markPath + '.type', String(mark.type || ''), 'type', version);
        if (version < 2 && V2_MARKS.has(mark.type)) throw schemaError('UNSUPPORTED_CONTENT_MARK', '此格式需要 Rich Content Schema v2', markPath + '.type', mark.type, 'type', version);
        const normalized: Record<string, unknown> = { type: mark.type };
        if (mark.type === 'link') normalized.attrs = normalizeAttrs('link', mark.attrs, markPath + '.attrs', version);
        else if (mark.type === 'textColor' || mark.type === 'highlight' || mark.type === 'fontSize' || mark.type === 'fontFamily') {
          const attrs = mark.attrs as Record<string, unknown> | undefined;
          if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) invalid(markPath + '.attrs', type, 'attrs', version);
          if (mark.type === 'textColor') {
            strictKeys(attrs, ['color'], markPath + '.attrs', type, version);
            const color = normalizeHexColor(attrs.color);
            if (!color) invalid(markPath + '.attrs.color', type, 'color', version);
            normalized.attrs = { color };
          } else if (mark.type === 'highlight') {
            strictKeys(attrs, ['color'], markPath + '.attrs', type, version);
            if (typeof attrs.color !== 'string' || !HIGHLIGHTS.has(attrs.color)) invalid(markPath + '.attrs.color', type, 'color', version);
            normalized.attrs = { color: attrs.color };
          } else if (mark.type === 'fontSize') {
            strictKeys(attrs, ['size'], markPath + '.attrs', type, version);
            const size = typeof attrs.size === 'number' ? attrs.size : Number(String(attrs.size).replace(/px$/, ''));
            if (!FONT_SIZES.has(size)) invalid(markPath + '.attrs.size', type, 'size', version);
            normalized.attrs = { size: size + 'px' };
          } else {
            strictKeys(attrs, ['family'], markPath + '.attrs', type, version);
            if (typeof attrs.family !== 'string' || !FONT_FAMILIES.has(attrs.family)) invalid(markPath + '.attrs.family', type, 'family', version);
            normalized.attrs = { family: attrs.family };
          }
        } else if (mark.attrs !== undefined) {
          const attrs = mark.attrs;
          if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs) || Object.keys(attrs).length) invalid(markPath + '.attrs', type, 'attrs', version);
        }
        return normalized;
      });
    }
    if (type === 'mention') {
      mentions.add(Number((output.attrs as any)?.userId));
      if (mentions.size > 20) throw schemaError('MENTION_LIMIT_EXCEEDED', '单篇正文最多提及 20 位不同用户', path + '.attrs.userId', type, 'userId', version);
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) invalid(path + '.content', type, 'content', version);
      if (!['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'codeBlock', 'table', 'tableRow', 'tableHeader', 'tableCell', 'spoiler'].includes(type) && node.content.length) invalid(path + '.content', type, 'content', version);
      if (type === 'codeBlock' && node.content.some((child: any) => child?.type !== 'text')) invalid(path + '.content', type, 'content', version);
      const invalidIndex = node.content.findIndex((child: any) => !child || typeof child !== 'object' || !childAllowed(type, child.type));
      if (invalidIndex !== -1) invalid(path + '.content[' + invalidIndex + ']', type, 'content', version);
      output.content = node.content.map((child, index) => visit(child, depth + 1, path + '.content[' + index + ']', type, inSpoiler || type === 'spoiler'));
    } else if (type === 'paragraph' || type === 'heading') output.content = [];
    if ((type === 'doc' || ['blockquote', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'table', 'tableRow', 'tableHeader', 'tableCell', 'spoiler'].includes(type)) && !Array.isArray(node.content)) invalid(path + '.content', type, 'content', version);
    if (type === 'codeBlock' && node.content === undefined) output.content = [];
    if (['blockquote', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'table', 'tableRow', 'tableHeader', 'tableCell', 'spoiler'].includes(type)
      && (!Array.isArray(node.content) || node.content.length === 0)) invalid(path + '.content', type, 'content', version);
    if (type === 'listItem' || type === 'taskItem') {
      if (node.content?.[0]?.type !== 'paragraph') invalid(path + '.content[0]', type, 'content', version);
    }
    if (type === 'doc' && depth !== 0) invalid(path, type, 'type', version);
    if (type === 'text' && node.content !== undefined) invalid(path + '.content', type, 'content', version);
    if (type === 'attachment' && (output.attrs as any)?.draftToken && !options.allowDraftAttachments) throw schemaError('ATTACHMENT_DRAFT_UNRESOLVED', '附件草稿必须在发布时绑定到正文', path + '.attrs.draftToken', type, 'draftToken', version);
    return output;
  };

  const normalized = visit(input, 0, '$');
  if (normalized.type !== 'doc' || !Array.isArray(normalized.content)) invalid('$', 'doc', 'type', version);
  return normalized as TiptapDocument;
}

export function collectDraftAttachmentTokens(input: unknown): string[] {
  const document = normalizeTiptapDocument(input, { schemaVersion: 2, allowDraftAttachments: true });
  const tokens = new Set<string>();
  const visit = (node: Record<string, any>) => {
    if (node.type === 'attachment' && node.attrs?.draftToken) tokens.add(String(node.attrs.draftToken));
    for (const child of node.content || []) visit(child);
  };
  visit(document as unknown as Record<string, any>);
  if (tokens.size > 5) throw schemaError('ATTACHMENT_LIMIT_EXCEEDED', '每篇正文最多引用 5 个附件', '$.content', 'attachment', 'draftToken', 2);
  return [...tokens];
}

export function replaceDraftAttachmentTokens(input: unknown, tokenIds: Map<string, number>): TiptapDocument {
  const document = normalizeTiptapDocument(input, { schemaVersion: 2, allowDraftAttachments: true });
  const visit = (node: Record<string, any>) => {
    if (node.type === 'attachment' && node.attrs?.draftToken) {
      const id = tokenIds.get(String(node.attrs.draftToken));
      if (!id) throw schemaError('ATTACHMENT_DRAFT_UNRESOLVED', '附件草稿没有绑定到正文', '$.attrs.draftToken', 'attachment', 'draftToken', 2);
      node.attrs = { attachmentId: id };
    }
    for (const child of node.content || []) visit(child);
  };
  visit(document as unknown as Record<string, any>);
  return normalizeTiptapDocument(document, { schemaVersion: 2 });
}

export function collectTiptapMentionIds(input: unknown): number[] {
  const document = normalizeTiptapDocument(input, { schemaVersion: 2, allowDraftAttachments: true });
  const ids = new Set<number>();
  const visit = (node: Record<string, any>) => {
    if (node.type === 'mention') ids.add(Number(node.attrs.userId));
    for (const child of node.content || []) visit(child);
  };
  visit(document as unknown as Record<string, any>);
  return [...ids];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderInlineMarks(text: string, marks: Array<Record<string, any>> = []): string {
  let output = escapeHtml(text);
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': output = '<strong>' + output + '</strong>'; break;
      case 'italic': output = '<em>' + output + '</em>'; break;
      case 'strike': output = '<del>' + output + '</del>'; break;
      case 'underline': output = '<u>' + output + '</u>'; break;
      case 'code': output = '<code>' + output + '</code>'; break;
      case 'superscript': output = '<sup>' + output + '</sup>'; break;
      case 'subscript': output = '<sub>' + output + '</sub>'; break;
      case 'textColor': output = '<span data-color="' + escapeHtml(mark.attrs.color) + '">' + output + '</span>'; break;
      case 'highlight': output = '<span data-highlight="' + escapeHtml(mark.attrs.color) + '">' + output + '</span>'; break;
      case 'fontSize': output = '<span data-font-size="' + escapeHtml(mark.attrs.size) + '">' + output + '</span>'; break;
      case 'fontFamily': output = '<span data-font-family="' + escapeHtml(mark.attrs.family) + '">' + output + '</span>'; break;
      case 'link': output = '<a href="' + escapeHtml(String(mark.attrs.href)) + '"' + (mark.attrs.title ? ' title="' + escapeHtml(String(mark.attrs.title)) + '"' : '') + '>' + output + '</a>'; break;
    }
  }
  return output;
}

function renderNode(raw: Record<string, any>): string {
  const children = (raw.content || []).map(renderNode).join('');
  switch (raw.type) {
    case 'doc': return children;
    case 'text': return renderInlineMarks(raw.text, raw.marks);
    case 'paragraph': return '<p>' + children + '</p>';
    case 'heading': return '<h' + raw.attrs.level + '>' + children + '</h' + raw.attrs.level + '>';
    case 'blockquote': return '<blockquote>' + children + '</blockquote>';
    case 'bulletList': return '<ul>' + children + '</ul>';
    case 'orderedList': return '<ol' + (raw.attrs?.start && raw.attrs.start !== 1 ? ' start="' + raw.attrs.start + '"' : '') + (raw.attrs?.type ? ' type="' + raw.attrs.type + '"' : '') + '>' + children + '</ol>';
    case 'listItem': return '<li>' + children + '</li>';
    case 'taskList': return '<ul data-task-list="true">' + children + '</ul>';
    case 'taskItem': return '<li data-task-item="true"><input type="checkbox" disabled="disabled"' + (raw.attrs?.checked ? ' checked="checked"' : '') + '>' + children + '</li>';
    case 'codeBlock': return '<pre><code' + (raw.attrs?.language ? ' class="language-' + escapeHtml(raw.attrs.language) + '"' : '') + '>' + children + '</code></pre>';
    case 'hardBreak': return '<br>';
    case 'horizontalRule': return '<hr>';
    case 'image': return '<img src="' + escapeHtml(raw.attrs.src) + '" alt="' + escapeHtml(raw.attrs.alt || '') + '"' + (raw.attrs.title ? ' title="' + escapeHtml(raw.attrs.title) + '"' : '') + (raw.attrs.width ? ' width="' + raw.attrs.width + '"' : '') + (raw.attrs.height ? ' height="' + raw.attrs.height + '"' : '') + '>';
    case 'table': return '<table><tbody>' + children + '</tbody></table>';
    case 'tableRow': return '<tr>' + children + '</tr>';
    case 'tableHeader': return '<th' + (raw.attrs?.colspan ? ' colspan="' + raw.attrs.colspan + '"' : '') + (raw.attrs?.rowspan ? ' rowspan="' + raw.attrs.rowspan + '"' : '') + (raw.attrs?.align ? ' data-align="' + raw.attrs.align + '"' : '') + ' scope="col">' + children + '</th>';
    case 'tableCell': return '<td' + (raw.attrs?.colspan ? ' colspan="' + raw.attrs.colspan + '"' : '') + (raw.attrs?.rowspan ? ' rowspan="' + raw.attrs.rowspan + '"' : '') + (raw.attrs?.align ? ' data-align="' + raw.attrs.align + '"' : '') + '>' + children + '</td>';
    case 'spoiler': return '<details' + (raw.attrs?.open ? ' open="open"' : '') + '><summary>' + escapeHtml(raw.attrs?.title || '剧透内容') + '</summary>' + children + '</details>';
    case 'mention': return '<a data-mention-user-id="' + raw.attrs.userId + '" href="/users/' + raw.attrs.userId + '"><span class="rich-mention">@' + escapeHtml(raw.attrs.username) + '</span></a>';
    case 'customEmoji': return '<img data-custom-emoji-id="' + raw.attrs.id + '" src="/api/custom-emojis/' + raw.attrs.id + '/image" alt=":' + escapeHtml(raw.attrs.shortcode) + ':" title="' + escapeHtml(raw.attrs.name) + '">';
    case 'video': {
      const href = raw.attrs.provider === 'direct' ? raw.attrs.src : '#';
      return '<a data-rich-video-provider="' + escapeHtml(raw.attrs.provider) + '"' + (raw.attrs.videoId ? ' data-rich-video-id="' + escapeHtml(raw.attrs.videoId) + '"' : '') + ' href="' + escapeHtml(href) + '">' + escapeHtml(raw.attrs.title || ('播放 ' + raw.attrs.provider + ' 视频')) + '</a>';
    }
    case 'attachment': return '<a data-attachment-id="' + raw.attrs.attachmentId + '" href="/api/attachments/' + raw.attrs.attachmentId + '/download">附件 #' + raw.attrs.attachmentId + '</a>';
    case 'postQuote': return '<aside data-quote-type="post"><a href="/posts/' + raw.attrs.postId + '">引用帖子 #' + raw.attrs.postId + '</a></aside>';
    case 'replyQuote': return '<aside data-quote-type="reply" data-post-id="' + raw.attrs.postId + '" data-reply-id="' + raw.attrs.replyId + '"><a href="/posts/' + raw.attrs.postId + '#reply-' + raw.attrs.replyId + '">引用回复 #' + raw.attrs.replyId + '</a></aside>';
    default: return '';
  }
}

export function renderTiptapDocument(input: unknown, options: NormalizeContentOptions = { schemaVersion: 2 }): string {
  const document = normalizeTiptapDocument(input, options);
  return sanitize(renderNode(document as unknown as Record<string, any>));
}

function inlineTokens(tokens: any[] = [], marks: Array<Record<string, unknown>> = []): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  for (const token of tokens) {
    if (token.type === 'strong' || token.type === 'em' || token.type === 'del' || token.type === 'codespan' || token.type === 'link') {
      const markType = ({ strong: 'bold', em: 'italic', del: 'strike', codespan: 'code', link: 'link' } as Record<string, string>)[token.type];
      const attrs = token.type === 'link' ? { href: token.href, ...(token.title ? { title: token.title } : {}) } : undefined;
      const nestedTokens = token.tokens || [{ type: 'text', text: token.text || token.raw || '' }];
      if (token.type === 'link' && !safeUrl(token.href)) output.push(...inlineTokens(nestedTokens, marks));
      else output.push(...inlineTokens(nestedTokens, [...marks, { type: markType, ...(attrs ? { attrs } : {}) }]));
    } else if (token.type === 'image') {
      if (safeUrl(token.href, true)) output.push({ type: 'image', attrs: { src: token.href, alt: token.text || '', ...(token.title ? { title: token.title } : {}) } });
      else if (token.text) output.push({ type: 'text', text: token.text, ...(marks.length ? { marks } : {}) });
    } else if (token.type === 'br') output.push({ type: 'hardBreak' });
    else if (token.tokens) output.push(...inlineTokens(token.tokens, marks));
    else {
      const text = token.text ?? token.raw;
      if (typeof text === 'string' && text) output.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
    }
  }
  return output;
}

function blockTokens(tokens: any[] = []): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'space': break;
      case 'paragraph':
      case 'text': output.push({ type: 'paragraph', content: inlineTokens(token.tokens || [{ type: 'text', text: token.text || '' }]) }); break;
      case 'heading': output.push({ type: 'heading', attrs: { level: Math.min(6, Math.max(1, token.depth || 1)) }, content: inlineTokens(token.tokens || []) }); break;
      case 'blockquote': output.push({ type: 'blockquote', content: blockTokens(token.tokens || []) }); break;
      case 'list':
        {
        const isTaskList = !token.ordered && (token.items || []).some((item: any) => item.task === true && typeof item.checked === 'boolean');
        output.push({
          type: isTaskList ? 'taskList' : token.ordered ? 'orderedList' : 'bulletList',
          ...(!isTaskList ? { attrs: { ...(token.ordered && token.start > 1 ? { start: token.start } : {}), tight: Boolean(token.loose === false) } } : {}),
          content: (token.items || []).map((item: any) => {
            const blocks = blockTokens(item.tokens || [{ type: 'text', text: item.text || '' }]);
            if (!blocks.length) blocks.push({ type: 'paragraph', content: [] });
            return isTaskList
              ? { type: 'taskItem', attrs: { checked: Boolean(item.checked) }, content: blocks }
              : { type: 'listItem', content: blocks };
          }),
        });
        break;
        }
      case 'code': {
        const language = String(token.lang || '').split(/\s/)[0];
        output.push({ type: 'codeBlock', ...(language && /^[A-Za-z0-9_+-]{1,64}$/.test(language) ? { attrs: { language } } : {}), content: token.text ? [{ type: 'text', text: token.text }] : [] });
        break;
      }
      case 'hr': output.push({ type: 'horizontalRule' }); break;
      case 'table': {
        const row = (cells: any[], header: boolean) => ({
          type: 'tableRow',
          content: cells.map((cell) => ({
            type: header ? 'tableHeader' : 'tableCell',
            content: [{ type: 'paragraph', content: inlineTokens(cell.tokens || [{ type: 'text', text: cell.text || '' }]) }],
          })),
        });
        output.push({ type: 'table', content: [row(token.header || [], true), ...(token.rows || []).map((cells: any[]) => row(cells, false))] });
        break;
      }
      default:
        if (typeof token.text === 'string' && token.text) output.push({ type: 'paragraph', content: [{ type: 'text', text: token.text }] });
    }
  }
  return output;
}

export function markdownToTiptapDocument(markdown: string): TiptapDocument {
  return normalizeTiptapDocument({ type: 'doc', content: blockTokens(marked.lexer(markdown) as any[]) }, { schemaVersion: 2 });
}

function inlineMarkdown(nodes: any[] = []): string {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return '  \n';
    if (node.type === 'image') return '![' + (node.attrs?.alt || '') + '](' + (node.attrs?.src || '') + ')';
    if (node.type === 'mention') return '@' + node.attrs.username;
    if (node.type === 'customEmoji') return ':' + node.attrs.shortcode + ':';
    if (node.type !== 'text') return serializeTiptapToMarkdown({ type: 'doc', content: [node] });
    let value = node.text || '';
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') value = '**' + value + '**';
      if (mark.type === 'italic') value = '*' + value + '*';
      if (mark.type === 'strike') value = '~~' + value + '~~';
      if (mark.type === 'code') value = String.fromCharCode(96) + value + String.fromCharCode(96);
      if (mark.type === 'link') value = '[' + value + '](' + (mark.attrs?.href || '') + ')';
    }
    return value;
  }).join('');
}

export function serializeTiptapToMarkdown(input: unknown): string {
  const document = normalizeTiptapDocument(input, { schemaVersion: 2, allowDraftAttachments: true });
  const serializeListItem = (item: any, depth: number): string => (item.content || []).map((child: any) => child.type === 'paragraph'
    ? inlineMarkdown(child.content || '')
    : renderBlocks([child], depth)).join('').trimStart() + '\n';
  const renderBlocks = (nodes: any[], depth = 0): string => nodes.map((node: any) => {
    const children = renderBlocks(node.content || [], depth);
    switch (node.type) {
      case 'doc': return children;
      case 'text': return inlineMarkdown([node]);
      case 'paragraph': return inlineMarkdown(node.content || []) + '\n\n';
      case 'heading': return '#'.repeat(node.attrs?.level || 1) + ' ' + inlineMarkdown(node.content || []) + '\n\n';
      case 'blockquote': return children.trim().split('\n').map((line: string) => '> ' + line).join('\n') + '\n\n';
      case 'bulletList': return (node.content || []).map((item: any) => '  '.repeat(depth) + '- ' + serializeListItem(item, depth + 1)).join('') + '\n';
      case 'orderedList': return (node.content || []).map((item: any, index: number) => '  '.repeat(depth) + ((node.attrs?.start || 1) + index) + '. ' + serializeListItem(item, depth + 1)).join('') + '\n';
      case 'taskList': return (node.content || []).map((item: any) => '  '.repeat(depth) + '- [' + (item.attrs?.checked ? 'x' : ' ') + '] ' + serializeListItem(item, depth + 1)).join('') + '\n';
      case 'listItem':
      case 'taskItem': return serializeListItem(node, depth);
      case 'codeBlock': return '~~~' + (node.attrs?.language || '') + '\n' + (node.content || []).map((child: any) => child.text || '').join('') + '\n~~~\n\n';
      case 'horizontalRule': return '---\n\n';
      case 'image': return '![' + (node.attrs?.alt || '') + '](' + (node.attrs?.src || '') + ')\n\n';
      case 'table': return (node.content || []).map((row: any, rowIndex: number) => {
        const cells = (row.content || []).map((cell: any) => (cell.content || []).map((block: any) => block.type === 'paragraph' ? inlineMarkdown(block.content || []) : renderBlocks([block]).trim()).join(' '));
        return '| ' + cells.join(' | ') + ' |\n' + (rowIndex === 0 ? '| ' + cells.map(() => '---').join(' | ') + ' |\n' : '');
      }).join('') + '\n';
      case 'spoiler': return '> [!SPOILER] ' + node.attrs.title + '\n' + children.trim().split('\n').map((line: string) => '> ' + line).join('\n') + '\n\n';
      case 'video': return (node.attrs.src || '[' + node.attrs.provider + ' video ' + node.attrs.videoId + ']') + '\n\n';
      case 'attachment': return '[Attachment #' + (node.attrs.attachmentId || 'draft') + ']\n\n';
      case 'postQuote': return '[Quoted post #' + node.attrs.postId + '](/posts/' + node.attrs.postId + ')\n\n';
      case 'replyQuote': return '[Quoted reply #' + node.attrs.replyId + '](/posts/' + node.attrs.postId + '#reply-' + node.attrs.replyId + ')\n\n';
      case 'tableRow':
      case 'tableCell':
      case 'tableHeader': return children;
      default: return children;
    }
  }).join('');
  return renderBlocks([document]).trim();
}

export function extractTiptapText(input: unknown): string {
  const document = normalizeTiptapDocument(input, { schemaVersion: 2, allowDraftAttachments: true });
  const inlineContainers = new Set(['paragraph', 'heading', 'codeBlock']);
  const visit = (node: Record<string, any>): string => {
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'image') return node.attrs?.alt || '';
    if (node.type === 'mention') return '@' + node.attrs.username;
    if (node.type === 'customEmoji') return ':' + node.attrs.shortcode + ':';
    if (node.type === 'video') return node.attrs.title || (node.attrs.provider + ' video');
    if (node.type === 'attachment') return '[Attachment ' + (node.attrs.attachmentId || 'draft') + ']';
    if (node.type === 'postQuote') return '[Quoted post #' + node.attrs.postId + ']';
    if (node.type === 'replyQuote') return '[Quoted reply #' + node.attrs.replyId + ']';
    if (node.type === 'taskItem') return (node.attrs?.checked ? '[x] ' : '[ ] ') + (node.content || []).map(visit).join('\n');
    if (node.type === 'spoiler') return (node.attrs?.title || '剧透内容') + '\n' + (node.content || []).map(visit).join('\n');
    const children = (node.content || []).map(visit);
    const separator = node.type === 'tableRow' ? ' | ' : inlineContainers.has(node.type) ? '' : '\n';
    return children.join(separator);
  };
  return visit(document as unknown as Record<string, any>).replace(/\n{3,}/g, '\n\n').trim();
}

export interface ResolvedContentSource {
  content: string;
  content_json: TiptapDocument;
  content_html: string;
  content_text: string;
  content_schema_version: 2;
}

export function resolveContentSource(markdown: string | undefined, json: unknown, schemaVersion?: number, options: NormalizeContentOptions = {}): ResolvedContentSource {
  const normalizeOptions = { ...options, schemaVersion: schemaVersion ?? 1 };
  if (json !== undefined && json !== null) {
    const content_json = normalizeTiptapDocument(json, normalizeOptions);
    const content = serializeTiptapToMarkdown(content_json);
    if (!content.trim()) throw new ApiV1Exception('CONTENT_REQUIRED', HttpStatus.BAD_REQUEST, '正文不能为空', false);
    return {
      content,
      content_json,
      content_html: renderTiptapDocument(content_json, { ...normalizeOptions, schemaVersion: 2 }),
      content_text: extractTiptapText(content_json),
      content_schema_version: RICH_CONTENT_SCHEMA_VERSION,
    };
  }
  if (typeof markdown !== 'string' || !markdown.trim()) throw new ApiV1Exception('CONTENT_REQUIRED', HttpStatus.BAD_REQUEST, '正文不能为空', false);
  if (markdown.length > MAX_TEXT_LENGTH) throw new ApiV1Exception('CONTENT_TOO_LARGE', HttpStatus.BAD_REQUEST, '正文过长', false);
  const content_json = markdownToTiptapDocument(markdown);
  return {
    content: serializeTiptapToMarkdown(content_json),
    content_json,
    content_html: renderTiptapDocument(content_json),
    content_text: extractTiptapText(content_json),
    content_schema_version: RICH_CONTENT_SCHEMA_VERSION,
  };
}

export function resolveOptionalContentSource(markdown: string | undefined, json: unknown, schemaVersion?: number): ResolvedContentSource | null {
  if ((json === undefined || json === null) && (typeof markdown !== 'string' || !markdown.trim())) return null;
  return resolveContentSource(markdown, json, schemaVersion, { resourceDescription: true });
}
