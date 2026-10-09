'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { textColorStyle, highlightStyle, fontSizeStyle, fontFamilyStyle } from '@/lib/tiptap/presentation';
import { richTableLayout } from '@/lib/tiptap/table-presentation';
import { safeUrl } from '@/lib/tiptap/presentation-url';
import { RichVideoCard } from '@/components/rich-content/rich-video-card';
import { RichAttachmentCard } from '@/components/rich-content/rich-attachment-card';
import { RichQuoteCard } from '@/components/rich-content/rich-quote-card';
import { RichCodeBlock } from '@/components/rich-content/rich-code-block';

type RichNode = Record<string, any>;
type RichMark = Record<string, any>;

const RENDERABLE_NODES = new Set([
  'doc', 'paragraph', 'heading', 'text', 'hardBreak', 'blockquote', 'bulletList', 'orderedList',
  'listItem', 'taskList', 'taskItem', 'codeBlock', 'horizontalRule', 'image', 'table', 'tableRow',
  'tableHeader', 'tableCell', 'spoiler', 'mention', 'customEmoji', 'video', 'attachment', 'postQuote', 'replyQuote',
]);
const RENDERABLE_MARKS = new Set([
  'bold', 'italic', 'strike', 'underline', 'code', 'link', 'textColor', 'highlight', 'fontSize', 'fontFamily', 'superscript', 'subscript',
]);

function isRenderableDocument(value: unknown): value is RichNode {
  let count = 0;
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || ++count > 5000) return false;
    const candidate = node as RichNode;
    if (typeof candidate.type !== 'string' || !RENDERABLE_NODES.has(candidate.type)) return false;
    if (candidate.type === 'text' && typeof candidate.text !== 'string') return false;
    if (candidate.content !== undefined && !Array.isArray(candidate.content)) return false;
    if (candidate.marks !== undefined && (!Array.isArray(candidate.marks) || candidate.marks.some((mark: RichMark) => !mark || !RENDERABLE_MARKS.has(mark.type)))) return false;
    return (candidate.content || []).every(visit);
  };
  return Boolean(value && (value as RichNode).type === 'doc' && Array.isArray((value as RichNode).content) && visit(value));
}

function InlineMarks({ marks = [], children }: { marks?: RichMark[]; children: React.ReactNode }) {
  // ProseMirror wraps marks in schema order (first mark outermost).
  return [...marks].reverse().reduce<React.ReactNode>((content, mark, index) => {
    switch (mark.type) {
      case 'bold': return <strong key={index}>{content}</strong>;
      case 'italic': return <em key={index}>{content}</em>;
      case 'strike': return <del key={index}>{content}</del>;
      case 'underline': return <u key={index}>{content}</u>;
      case 'code': return <code key={index} className="rich-inline-code">{content}</code>;
      case 'superscript': return <sup key={index}>{content}</sup>;
      case 'subscript': return <sub key={index}>{content}</sub>;
      case 'link': {
        const href = safeUrl(mark.attrs?.href);
        return href ? <a key={index} href={href} target={href.startsWith('/') || href.startsWith('mailto:') ? undefined : '_blank'} rel="nofollow noopener noreferrer">{content}</a> : content;
      }
      case 'textColor': return <span key={index} data-color={mark.attrs?.color} style={textColorStyle(mark.attrs?.color)}>{content}</span>;
      case 'highlight': return <span key={index} data-highlight={mark.attrs?.color} style={highlightStyle(mark.attrs?.color)}>{content}</span>;
      case 'fontSize': return <span key={index} data-font-size={mark.attrs?.size} style={fontSizeStyle(mark.attrs?.size)}>{content}</span>;
      case 'fontFamily': return <span key={index} data-font-family={mark.attrs?.family} style={fontFamilyStyle(mark.attrs?.family)}>{content}</span>;
      default: return content;
    }
  }, children);
}

function RichNodeView({ node, readonly = true }: { node: RichNode; readonly?: boolean }): React.ReactNode {
  const children = (node.content || []).map((child: RichNode, index: number) => <Fragment key={index}>{RichNodeView({ node: child, readonly })}</Fragment>);
  switch (node.type) {
    case 'doc': return <>{children}</>;
    case 'text': return <InlineMarks marks={node.marks}>{node.text}</InlineMarks>;
    case 'paragraph': return <p>{children.length ? children : <br />}</p>;
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      const Tag = ('h' + level) as keyof JSX.IntrinsicElements;
      return <Tag>{children}</Tag>;
    }
    case 'hardBreak': return <br />;
    case 'blockquote': return <blockquote>{children}</blockquote>;
    case 'bulletList': return <ul>{children}</ul>;
    case 'orderedList': return <ol start={node.attrs?.start || 1} type={['1', 'a', 'A', 'i', 'I'].includes(node.attrs?.type) ? node.attrs.type : undefined}>{children}</ol>;
    case 'listItem': return <li>{children}</li>;
    case 'taskList': return <ul data-task-list="true">{children}</ul>;
    case 'taskItem': return <li data-task-item="true" data-checked={String(Boolean(node.attrs?.checked))}><input data-task-checkbox="true" data-testid="rich-task-checkbox" type="checkbox" checked={Boolean(node.attrs?.checked)} disabled={readonly} readOnly aria-label={node.attrs?.checked ? '已完成' : '未完成'} /><div data-task-content="true">{children}</div></li>;
    case 'codeBlock': return <RichCodeBlock language={node.attrs?.language} text={(node.content || []).map((part: RichNode) => part.text || '').join('')} />;
    case 'horizontalRule': return <hr />;
    case 'image': {
      const src = safeUrl(node.attrs?.src, true);
      return src ? <img className="rich-content-image" src={src} alt={node.attrs?.alt || ''} title={node.attrs?.title || undefined} width={Number.isSafeInteger(node.attrs?.width) && node.attrs.width <= 4096 ? node.attrs.width : undefined} height={Number.isSafeInteger(node.attrs?.height) && node.attrs.height <= 4096 ? node.attrs.height : undefined} loading="lazy" decoding="async" /> : null;
    }
    case 'table': {
      const layout = richTableLayout(node);
      return <div className="tableWrapper"><table style={layout.width ? { width: layout.width } : undefined}><colgroup>{layout.columns.map((width, index) => <col key={index} style={width ? { width: `${width}px` } : undefined} />)}</colgroup><tbody>{children}</tbody></table></div>;
    }
    case 'tableRow': return <tr>{children}</tr>;
    case 'tableHeader': return <th colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan} style={['left', 'center', 'right'].includes(node.attrs?.align) ? { textAlign: node.attrs.align } : undefined}>{children}</th>;
    case 'tableCell': return <td colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan} style={['left', 'center', 'right'].includes(node.attrs?.align) ? { textAlign: node.attrs.align } : undefined}>{children}</td>;
    case 'spoiler': return <details data-type="spoiler" className="rich-spoiler" data-testid="rich-spoiler" open={Boolean(node.attrs?.open)}><summary>{node.attrs?.title || '剧透内容'}</summary><div data-spoiler-content="true">{children}</div></details>;
    case 'mention': {
      const id = Number(node.attrs?.userId);
      const username = String(node.attrs?.username || '');
      return Number.isSafeInteger(id) && id > 0 ? <Link href={'/users/' + id} className="rich-mention" data-testid="rich-mention">@{username}</Link> : <span>@{username}</span>;
    }
    case 'customEmoji': {
      const id = Number(node.attrs?.id);
      const shortcode = String(node.attrs?.shortcode || '');
      return Number.isSafeInteger(id) && id > 0 ? <img className="rich-custom-emoji" src={'/api/custom-emojis/' + id + '/image'} alt={':' + shortcode + ':'} title={String(node.attrs?.name || shortcode)} loading="lazy" /> : <span>:{shortcode}:</span>;
    }
    case 'video': return <RichVideoCard attrs={node.attrs || {}} />;
    case 'attachment': {
      const id = Number(node.attrs?.attachmentId);
      return <RichAttachmentCard id={Number.isSafeInteger(id) && id > 0 ? id : undefined} draftToken={node.attrs?.draftToken} />;
    }
    case 'postQuote': {
      const id = Number(node.attrs?.postId);
      return Number.isSafeInteger(id) && id > 0 ? <RichQuoteCard postId={id} /> : null;
    }
    case 'replyQuote': {
      const postId = Number(node.attrs?.postId);
      const replyId = Number(node.attrs?.replyId);
      return Number.isSafeInteger(postId) && postId > 0 && Number.isSafeInteger(replyId) && replyId > 0
        ? <RichQuoteCard postId={postId} replyId={replyId} />
        : null;
    }
    default: return null;
  }
}

export interface RichContentRendererProps {
  json?: Record<string, unknown> | null;
  markdownFallback?: string | null;
  className?: string;
  readonly?: boolean;
}

export default function RichContentRenderer({ json, markdownFallback, className, readonly = true }: RichContentRendererProps) {
  const document = isRenderableDocument(json) ? json : null;
  if (!document) return <MarkdownRenderer content={markdownFallback || ''} className={className || ''} />;
  return <div className={'mdtbbs-rich-content mdtbbs-rich-content--readonly rich-content-renderer ' + (className || '')} data-testid="rich-content-renderer">{RichNodeView({ node: document, readonly })}</div>;
}
