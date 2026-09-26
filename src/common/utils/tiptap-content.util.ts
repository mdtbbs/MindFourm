import { HttpStatus } from '@nestjs/common';
import { marked } from 'marked';
import { ApiV1Exception } from '../exceptions/api-v1.exception';
import { sanitize } from './markdown.util';

export type TiptapDocument = { type: 'doc'; content: Record<string, unknown>[] };

const BLOCK_NODES = new Set(['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'horizontalRule', 'table', 'tableRow', 'tableHeader', 'tableCell']);
const INLINE_NODES = new Set(['text', 'hardBreak', 'image']);
const MARKS = new Set(['bold', 'italic', 'strike', 'underline', 'code', 'link']);
const MAX_NODES = 5000;
const MAX_TEXT_LENGTH = 500_000;

function childAllowed(parent: string, child: string): boolean {
  if (parent === 'doc' || parent === 'blockquote') return ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'horizontalRule', 'table'].includes(child);
  if (parent === 'paragraph' || parent === 'heading') return INLINE_NODES.has(child);
  if (parent === 'tableCell' || parent === 'tableHeader') return ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'horizontalRule'].includes(child);
  if (parent === 'bulletList' || parent === 'orderedList') return child === 'listItem';
  if (parent === 'listItem') return ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'codeBlock', 'horizontalRule'].includes(child);
  if (parent === 'codeBlock') return child === 'text';
  if (parent === 'table') return child === 'tableRow';
  if (parent === 'tableRow') return child === 'tableCell' || child === 'tableHeader';
  return false;
}

function invalidJson(): ApiV1Exception {
  return new ApiV1Exception('INVALID_CONTENT_JSON', HttpStatus.BAD_REQUEST, '正文 JSON 不符合允许的 Tiptap schema', false);
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

function normalizeAttrs(type: string, attrs: unknown): Record<string, unknown> | undefined {
  if (attrs === undefined) return undefined;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) throw invalidJson();
  const source = attrs as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const copyText = (key: string, max = 512) => {
    const value = source[key];
    if (value === undefined || value === null) return;
    if (typeof value !== 'string' || value.length > max) throw invalidJson();
    result[key] = value;
  };
  switch (type) {
    case 'heading': {
      const level = source.level ?? 1;
      if (![1, 2, 3, 4, 5, 6].includes(Number(level))) throw invalidJson();
      result.level = Number(level);
      break;
    }
    case 'orderedList': {
      const start = source.start ?? 1;
      if (!Number.isSafeInteger(Number(start)) || Number(start) < 1 || Number(start) > 100_000) throw invalidJson();
      result.start = Number(start);
      break;
    }
    case 'codeBlock':
      copyText('language', 64);
      if (result.language && !/^[A-Za-z0-9_+-]+$/.test(String(result.language))) throw invalidJson();
      break;
    case 'image': {
      const src = safeUrl(source.src, true);
      if (!src) throw invalidJson();
      result.src = src;
      copyText('alt', 2048);
      copyText('title', 512);
      break;
    }
    case 'link': {
      const href = safeUrl(source.href);
      if (!href) throw invalidJson();
      result.href = href;
      copyText('title', 512);
      break;
    }
    case 'tableCell':
    case 'tableHeader':
      for (const key of ['colspan', 'rowspan']) {
        if (source[key] !== undefined) {
          const value = Number(source[key]);
          if (!Number.isInteger(value) || value < 1 || value > 100) throw invalidJson();
          result[key] = value;
        }
      }
      if (source.colwidth !== undefined && source.colwidth !== null) {
        if (!Array.isArray(source.colwidth) || source.colwidth.length > 100
          || source.colwidth.some((width) => !Number.isInteger(Number(width)) || Number(width) < 1 || Number(width) > 10_000)) throw invalidJson();
        result.colwidth = source.colwidth.map(Number);
      }
      if (type === 'tableHeader' && source.scope === 'col') result.scope = 'col';
      break;
    default:
      if (Object.keys(source).length) throw invalidJson();
  }
  return result;
}

/** Validate and copy only the small, safe subset of the Tiptap document schema used by the editor. */
export function normalizeTiptapDocument(input: unknown): TiptapDocument {
  let nodeCount = 0;
  let textLength = 0;
  const visit = (value: unknown, depth: number): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 32 || ++nodeCount > MAX_NODES) throw invalidJson();
    const node = value as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== 'string' || (!BLOCK_NODES.has(type) && !INLINE_NODES.has(type))) throw invalidJson();
    const output: Record<string, unknown> = { type };
    if (type === 'text') {
      if (typeof node.text !== 'string') throw invalidJson();
      textLength += node.text.length;
      if (textLength > MAX_TEXT_LENGTH) throw invalidJson();
      output.text = node.text;
    }
    if (node.attrs !== undefined) output.attrs = normalizeAttrs(type, node.attrs);
    if (node.marks !== undefined) {
      if (type !== 'text') throw invalidJson();
      if (!Array.isArray(node.marks) || node.marks.length > 8) throw invalidJson();
      output.marks = node.marks.map((rawMark) => {
        if (!rawMark || typeof rawMark !== 'object' || Array.isArray(rawMark)) throw invalidJson();
        const mark = rawMark as Record<string, unknown>;
        if (typeof mark.type !== 'string' || !MARKS.has(mark.type)) throw invalidJson();
        const normalized: Record<string, unknown> = { type: mark.type };
        if (mark.type === 'link') normalized.attrs = normalizeAttrs('link', mark.attrs);
        else if (mark.attrs !== undefined) {
          if (!mark.attrs || typeof mark.attrs !== 'object' || Array.isArray(mark.attrs) || Object.keys(mark.attrs).length) throw invalidJson();
        }
        return normalized;
      });
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw invalidJson();
      if (!['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'table', 'tableRow', 'tableHeader', 'tableCell'].includes(type) && node.content.length) throw invalidJson();
      if (type === 'codeBlock' && node.content.some((child: any) => child?.type !== 'text')) throw invalidJson();
      if (node.content.some((child: any) => !child || !childAllowed(type, child.type))) throw invalidJson();
      output.content = node.content.map((child) => visit(child, depth + 1));
    } else if (type === 'paragraph' || type === 'heading') {
      // ProseMirror omits `content` for an empty textblock in some editor
      // versions; normalize that valid empty block to the explicit form.
      output.content = [];
    }
    if ((type === 'doc' || ['blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'table', 'tableRow', 'tableHeader', 'tableCell'].includes(type)) && !Array.isArray(node.content)) throw invalidJson();
    if (type === 'doc' && depth !== 0) throw invalidJson();
    if (type === 'text' && node.content !== undefined) throw invalidJson();
    return output;
  };

  const normalized = visit(input, 0);
  if (normalized.type !== 'doc' || !Array.isArray(normalized.content)) throw invalidJson();
  return normalized as TiptapDocument;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderInlineMarks(text: string, marks: Array<Record<string, any>> = []): string {
  let output = escapeHtml(text);
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': output = `<strong>${output}</strong>`; break;
      case 'italic': output = `<em>${output}</em>`; break;
      case 'strike': output = `<del>${output}</del>`; break;
      case 'underline': output = `<u>${output}</u>`; break;
      case 'code': output = `<code>${output}</code>`; break;
      case 'link': output = `<a href="${escapeHtml(String(mark.attrs.href))}"${mark.attrs.title ? ` title="${escapeHtml(String(mark.attrs.title))}"` : ''}>${output}</a>`; break;
    }
  }
  return output;
}

function renderNode(raw: Record<string, any>): string {
  const children = (raw.content || []).map(renderNode).join('');
  switch (raw.type) {
    case 'doc': return children;
    case 'text': return renderInlineMarks(raw.text, raw.marks);
    case 'paragraph': return `<p>${children}</p>`;
    case 'heading': return `<h${raw.attrs?.level || 1}>${children}</h${raw.attrs?.level || 1}>`;
    case 'blockquote': return `<blockquote>${children}</blockquote>`;
    case 'bulletList': return `<ul>${children}</ul>`;
    case 'orderedList': return `<ol${raw.attrs?.start && raw.attrs.start !== 1 ? ` start="${raw.attrs.start}"` : ''}>${children}</ol>`;
    case 'listItem': return `<li>${children}</li>`;
    case 'codeBlock': return `<pre><code${raw.attrs?.language ? ` class="language-${escapeHtml(raw.attrs.language)}"` : ''}>${children}</code></pre>`;
    case 'hardBreak': return '<br>';
    case 'horizontalRule': return '<hr>';
    case 'image': return `<img src="${escapeHtml(raw.attrs.src)}" alt="${escapeHtml(raw.attrs.alt || '')}"${raw.attrs.title ? ` title="${escapeHtml(raw.attrs.title)}"` : ''}>`;
    case 'table': return `<table><tbody>${children}</tbody></table>`;
    case 'tableRow': return `<tr>${children}</tr>`;
    case 'tableHeader': return `<th${raw.attrs?.colspan ? ` colspan="${raw.attrs.colspan}"` : ''}${raw.attrs?.rowspan ? ` rowspan="${raw.attrs.rowspan}"` : ''} scope="col">${children}</th>`;
    case 'tableCell': return `<td${raw.attrs?.colspan ? ` colspan="${raw.attrs.colspan}"` : ''}${raw.attrs?.rowspan ? ` rowspan="${raw.attrs.rowspan}"` : ''}>${children}</td>`;
    default: return '';
  }
}

export function renderTiptapDocument(input: unknown): string {
  const document = normalizeTiptapDocument(input);
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
      case 'text':
        output.push({ type: 'paragraph', content: inlineTokens(token.tokens || [{ type: 'text', text: token.text || '' }]) });
        break;
      case 'heading':
        output.push({ type: 'heading', attrs: { level: Math.min(6, Math.max(1, token.depth || 1)) }, content: inlineTokens(token.tokens || []) });
        break;
      case 'blockquote': output.push({ type: 'blockquote', content: blockTokens(token.tokens || []) }); break;
      case 'list':
        output.push({ type: token.ordered ? 'orderedList' : 'bulletList', ...(token.ordered && token.start > 1 ? { attrs: { start: token.start } } : {}), content: (token.items || []).map((item: any) => ({ type: 'listItem', content: blockTokens(item.tokens || [{ type: 'text', text: item.text || '' }]) })) });
        break;
      case 'code': {
        const language = String(token.lang || '').split(/\s/)[0];
        output.push({ type: 'codeBlock', ...(language && /^[A-Za-z0-9_+-]{1,64}$/.test(language) ? { attrs: { language } } : {}), content: token.text ? [{ type: 'text', text: token.text }] : [] });
        break;
      }
      case 'hr': output.push({ type: 'horizontalRule' }); break;
      case 'table': {
        const row = (cells: any[], header: boolean) => ({ type: 'tableRow', content: cells.map((cell) => ({ type: header ? 'tableHeader' : 'tableCell', content: inlineTokens(cell.tokens || [{ type: 'text', text: cell.text || '' }]) })) });
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
  return normalizeTiptapDocument({ type: 'doc', content: blockTokens(marked.lexer(markdown) as any[]) });
}

function serializeInline(nodes: any[] = []): string {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return '  \n';
    if (node.type === 'image') return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})`;
    if (node.type !== 'text') return serializeTiptapToMarkdown({ type: 'doc', content: [node] });
    let value = node.text || '';
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') value = `**${value}**`;
      if (mark.type === 'italic') value = `*${value}*`;
      if (mark.type === 'strike') value = `~~${value}~~`;
      if (mark.type === 'code') value = `\`${value}\``;
      if (mark.type === 'link') value = `[${value}](${mark.attrs?.href || ''})`;
    }
    return value;
  }).join('');
}

export function serializeTiptapToMarkdown(input: unknown): string {
  const document = normalizeTiptapDocument(input);
  const block = (node: any, depth = 0): string => {
    const children = (node.content || []).map((child: any) => block(child, depth)).join('');
    switch (node.type) {
      case 'doc': return children.trim();
      case 'text': return serializeInline([node]);
      case 'paragraph': return `${serializeInline(node.content || [])}\n\n`;
      case 'heading': return `${'#'.repeat(node.attrs?.level || 1)} ${serializeInline(node.content || [])}\n\n`;
      case 'blockquote': return children.trim().split('\n').map((line: string) => `> ${line}`).join('\n') + '\n\n';
      case 'bulletList': return (node.content || []).map((item: any) => `${'  '.repeat(depth)}- ${block(item, depth + 1).trimStart()}`).join('') + '\n';
      case 'orderedList': return (node.content || []).map((item: any, index: number) => `${'  '.repeat(depth)}${(node.attrs?.start || 1) + index}. ${block(item, depth + 1).trimStart()}`).join('') + '\n';
      case 'listItem': return `${(node.content || []).map((child: any) => child.type === 'paragraph' ? serializeInline(child.content || []) : block(child, depth)).join('')}\n`;
      case 'codeBlock': return `\`\`\`${node.attrs?.language || ''}\n${(node.content || []).map((child: any) => child.text || '').join('')}\n\`\`\`\n\n`;
      case 'horizontalRule': return '---\n\n';
      case 'image': return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})\n\n`;
      case 'table': return `${(node.content || []).map((row: any, rowIndex: number) => `| ${(row.content || []).map((cell: any) => serializeInline(cell.content || [])).join(' | ')} |\n${rowIndex === 0 ? `| ${(row.content || []).map(() => '---').join(' | ')} |\n` : ''}`).join('')}\n`;
      case 'tableRow':
      case 'tableCell':
      case 'tableHeader': return children;
      case 'hardBreak': return '  \n';
      default: return children;
    }
  };
  return block(document).trim();
}

/** Plain-text projection used for excerpts, search, accessibility and notifications. */
export function extractTiptapText(input: unknown): string {
  const document = normalizeTiptapDocument(input);
  const inlineContainers = new Set(['paragraph', 'heading', 'codeBlock', 'tableCell', 'tableHeader']);
  const visit = (node: Record<string, any>): string => {
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'image') return node.attrs?.alt || '';
    const children = (node.content || []).map(visit);
    const separator = node.type === 'tableRow' ? ' | ' : inlineContainers.has(node.type) ? '' : '\n';
    return children.join(separator);
  };
  return visit(document as unknown as Record<string, any>).replace(/\n{3,}/g, '\n\n').trim();
}

export function resolveContentSource(markdown: string | undefined, json: unknown): { content: string; content_json: TiptapDocument; content_html: string; content_text: string } {
  if (json !== undefined && json !== null) {
    const content_json = normalizeTiptapDocument(json);
    const content = serializeTiptapToMarkdown(content_json);
    if (!content.trim()) throw new ApiV1Exception('CONTENT_REQUIRED', HttpStatus.BAD_REQUEST, '正文不能为空', false);
    return { content, content_json, content_html: renderTiptapDocument(content_json), content_text: extractTiptapText(content_json) };
  }
  if (typeof markdown !== 'string' || !markdown.trim()) throw new ApiV1Exception('CONTENT_REQUIRED', HttpStatus.BAD_REQUEST, '正文不能为空', false);
  if (markdown.length > MAX_TEXT_LENGTH) throw new ApiV1Exception('CONTENT_TOO_LARGE', HttpStatus.BAD_REQUEST, '正文过长', false);
  const content_json = markdownToTiptapDocument(markdown);
  return { content: markdown, content_json, content_html: renderTiptapDocument(content_json), content_text: extractTiptapText(content_json) };
}

/** Resource descriptions are optional; an empty editor document is a valid empty projection. */
export function resolveOptionalContentSource(markdown: string | undefined, json: unknown): { content: string; content_json: TiptapDocument; content_html: string; content_text: string } | null {
  if ((json === undefined || json === null) && (typeof markdown !== 'string' || !markdown.trim())) return null;
  if (json !== undefined && json !== null) {
    const content_json = normalizeTiptapDocument(json);
    const content = serializeTiptapToMarkdown(content_json);
    return {
      content,
      content_json,
      content_html: renderTiptapDocument(content_json),
      content_text: extractTiptapText(content_json),
    };
  }
  return resolveContentSource(markdown, undefined);
}
