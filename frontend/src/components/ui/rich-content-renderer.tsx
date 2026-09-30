'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { attachmentApi, postApi } from '@/lib/api/client';
import type { Attachment } from '@/types';
import { siteProfile } from '@/config/site-profile';
import { Archive, Download, FileImage, FileText, Loader2, Map, Play } from 'lucide-react';

type RichNode = Record<string, any>;
type RichMark = Record<string, any>;

const FONT_STACKS: Record<string, string> = {
  default: 'inherit',
  'serif-cn': '"Songti SC", SimSun, serif',
  'sans-cn': '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  kai: 'KaiTi, STKaiti, serif',
  'source-serif-cn': '"Noto Serif CJK SC", "Source Han Serif SC", serif',
  'source-sans-cn': '"Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  monospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
const FONT_SIZES = new Set([12, 14, 16, 18, 20, 24, 28, 32]);
const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#FFF2CC', green: '#D9EAD3', blue: '#CFE2F3', pink: '#F4CCCC', orange: '#FCE5CD',
};
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

function safeUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\\]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.split('/').includes('..')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:' || (!image && url.protocol === 'mailto:')) return value;
  } catch { /* Only absolute http(s) and safe root-relative paths render. */ }
  return null;
}

function safeVideoEmbed(node: RichNode): string | null {
  const provider = node.attrs?.provider;
  const id = String(node.attrs?.videoId || '');
  if (!siteProfile.videoProviders.includes(provider)) return null;
  if (provider === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(id)) return 'https://www.youtube-nocookie.com/embed/' + id;
  if (provider === 'bilibili' && /^BV[0-9A-Za-z]{10}$/.test(id)) return 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(id) + '&autoplay=0';
  if (provider === 'bilibili' && /^av[1-9][0-9]{0,14}$/.test(id)) return 'https://player.bilibili.com/player.html?aid=' + encodeURIComponent(id.slice(2)) + '&autoplay=0';
  if (provider === 'douyin' && /^[0-9]{5,32}$/.test(id)) return 'https://www.douyin.com/video/' + encodeURIComponent(id);
  return null;
}

function InlineMarks({ marks = [], children }: { marks?: RichMark[]; children: React.ReactNode }) {
  return marks.reduce<React.ReactNode>((content, mark, index) => {
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
      case 'textColor': {
        const color = typeof mark.attrs?.color === 'string' && /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/.test(mark.attrs.color) ? mark.attrs.color : undefined;
        return color ? <span key={index} style={{ color }}>{content}</span> : content;
      }
      case 'highlight': {
        const color = HIGHLIGHT_COLORS[mark.attrs?.color];
        return color ? <mark key={index} style={{ backgroundColor: color }}>{content}</mark> : content;
      }
      case 'fontSize': {
        const size = Number(String(mark.attrs?.size || '').replace(/px$/, ''));
        return FONT_SIZES.has(size) ? <span key={index} style={{ fontSize: size + 'px' }}>{content}</span> : content;
      }
      case 'fontFamily': {
        const family = FONT_STACKS[mark.attrs?.family];
        return family ? <span key={index} style={{ fontFamily: family }}>{content}</span> : content;
      }
      default: return content;
    }
  }, children);
}

function VideoCard({ node }: { node: RichNode }) {
  const [activated, setActivated] = useState(false);
  const provider = String(node.attrs?.provider || '');
  const title = String(node.attrs?.title || (provider + ' 视频'));
  const src = provider === 'direct' && siteProfile.videoProviders.includes('direct') ? safeUrl(node.attrs?.src, true) : null;
  const embed = safeVideoEmbed(node);
  if (src && /\.(?:mp4|webm)(?:$|[?#])/i.test(src)) {
    return <figure className="rich-video-card"><video controls preload="none" src={src} aria-label={title} /><figcaption>{title}</figcaption></figure>;
  }
  if (!embed) return <div className="rich-video-card" role="note">此视频来源在当前站点不可用。</div>;
  if (activated) {
    if (provider === 'douyin') return <a className="rich-video-poster" href={embed} target="_blank" rel="noopener noreferrer">在抖音打开视频 ↗</a>;
    return <figure className="rich-video-card">
      <iframe data-testid="rich-video-frame" src={embed} title={title} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
      <figcaption>{title}</figcaption>
    </figure>;
  }
  return <button type="button" className="rich-video-poster" data-testid="rich-video-activate" onClick={() => setActivated(true)}>
    <Play aria-hidden="true" size={18} /> {provider} 视频 · 点击加载
  </button>;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('text/') || mimeType === 'application/pdf') return FileText;
  return Archive;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function AttachmentCard({ id }: { id: number }) {
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  useEffect(() => {
    let live = true;
    attachmentApi.getById(id).then((result) => { if (live) setAttachment(result); }).catch(() => { if (live) setAttachment(null); });
    return () => { live = false; };
  }, [id]);
  if (!attachment) return <div className="rich-attachment-card" data-testid="rich-attachment-card" role="status">附件正在加载…</div>;
  const Icon = fileIcon(attachment.mime_type || '');
  const isForge = /\.(?:msav|msch)$/i.test(attachment.file_name);
  return <div className="rich-attachment-card" data-testid="rich-attachment-card">
    {isForge && attachment.renderer_status === 'ready' && <a href={attachmentApi.download(id)} target="_blank" rel="noreferrer" className="rich-attachment-preview"><img src={attachmentApi.preview(id)} alt={attachment.file_name + ' 预览'} /></a>}
    {isForge && attachment.renderer_status && !['ready', 'failed'].includes(attachment.renderer_status) && <span className="rich-attachment-preview-status"><Loader2 size={16} className="animate-spin" />正在生成蓝图预览</span>}
    <a href={attachmentApi.download(id)} className="rich-attachment-download">
      <Icon size={18} aria-hidden="true" />
      <span className="rich-attachment-name">{attachment.file_name}</span>
      <span className="rich-attachment-size">{formatSize(attachment.file_size)}</span>
      <Download size={16} aria-hidden="true" />
    </a>
  </div>;
}

function QuoteAvailabilityCard({ postId, replyId }: { postId: number; replyId?: number }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    postApi.getQuoteAvailability(postId, replyId).then(() => { if (live) setAvailable(true); }).catch(() => { if (live) setAvailable(false); });
    return () => { live = false; };
  }, [postId, replyId]);
  if (available === null) return <aside className="rich-quote-card" data-testid="rich-quote-card" role="status">正在检查引用权限…</aside>;
  if (!available) return <aside className="rich-quote-card" data-testid="rich-quote-card" role="note">引用的内容不可用</aside>;
  return <aside className="rich-quote-card" data-testid="rich-quote-card">
    <span>{replyId ? '引用回复' : '引用帖子'}</span>
    <Link href={replyId ? `/posts/${postId}#reply-${replyId}` : `/posts/${postId}`}>{replyId ? '查看引用回复' : '打开引用帖子'}</Link>
  </aside>;
}

function RichNodeView({ node, readonly = true }: { node: RichNode; readonly?: boolean }): React.ReactNode {
  const children = (node.content || []).map((child: RichNode, index: number) => <Fragment key={index}>{RichNodeView({ node: child, readonly })}</Fragment>);
  switch (node.type) {
    case 'doc': return <>{children}</>;
    case 'text': return <InlineMarks marks={node.marks}>{node.text}</InlineMarks>;
    case 'paragraph': return <p>{children}</p>;
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
    case 'taskList': return <ul className="rich-task-list">{children}</ul>;
    case 'taskItem': return <li className="rich-task-item"><input data-testid="rich-task-checkbox" type="checkbox" checked={Boolean(node.attrs?.checked)} disabled={readonly} readOnly aria-label={node.attrs?.checked ? '已完成' : '未完成'} />{children}</li>;
    case 'codeBlock': return <pre><code>{(node.content || []).map((part: RichNode) => part.text || '').join('')}</code></pre>;
    case 'horizontalRule': return <hr />;
    case 'image': {
      const src = safeUrl(node.attrs?.src, true);
      return src ? <img className="rich-content-image" src={src} alt={node.attrs?.alt || ''} title={node.attrs?.title || undefined} width={Number.isSafeInteger(node.attrs?.width) && node.attrs.width <= 4096 ? node.attrs.width : undefined} height={Number.isSafeInteger(node.attrs?.height) && node.attrs.height <= 4096 ? node.attrs.height : undefined} loading="lazy" decoding="async" /> : null;
    }
    case 'table': return <div className="rich-table-scroll"><table><tbody>{children}</tbody></table></div>;
    case 'tableRow': return <tr>{children}</tr>;
    case 'tableHeader': return <th colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan} style={['left', 'center', 'right'].includes(node.attrs?.align) ? { textAlign: node.attrs.align } : undefined}>{children}</th>;
    case 'tableCell': return <td colSpan={node.attrs?.colspan} rowSpan={node.attrs?.rowspan} style={['left', 'center', 'right'].includes(node.attrs?.align) ? { textAlign: node.attrs.align } : undefined}>{children}</td>;
    case 'spoiler': return <details className="rich-spoiler" data-testid="rich-spoiler" open={Boolean(node.attrs?.open)}><summary>{node.attrs?.title || '剧透内容'}</summary><div className="rich-spoiler-content">{children}</div></details>;
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
    case 'video': return <VideoCard node={node} />;
    case 'attachment': {
      const id = Number(node.attrs?.attachmentId);
      return Number.isSafeInteger(id) && id > 0 ? <AttachmentCard id={id} /> : <div className="rich-attachment-card">待发布附件</div>;
    }
    case 'postQuote': {
      const id = Number(node.attrs?.postId);
      return Number.isSafeInteger(id) && id > 0 ? <QuoteAvailabilityCard postId={id} /> : null;
    }
    case 'replyQuote': {
      const postId = Number(node.attrs?.postId);
      const replyId = Number(node.attrs?.replyId);
      return Number.isSafeInteger(postId) && postId > 0 && Number.isSafeInteger(replyId) && replyId > 0
        ? <QuoteAvailabilityCard postId={postId} replyId={replyId} />
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
  return <div className={'rich-content-renderer ' + (className || '')} data-testid="rich-content-renderer">{RichNodeView({ node: document, readonly })}</div>;
}
