'use client';

import { useEffect, useState } from 'react';
import { Archive, Download, FileImage, FileText, Loader2 } from 'lucide-react';
import { attachmentApi } from '@/lib/api/client';
import type { Attachment } from '@/types';
import { readAttachmentDraft } from '@/lib/tiptap/attachment-drafts';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function RichAttachmentCard({ id, draftToken, editing = false }: { id?: number; draftToken?: string; editing?: boolean }) {
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setAttachment(null);
    setFailed(false);
    if (!id) return;
    let live = true;
    // Permission-aware endpoint remains authoritative in all modes.
    attachmentApi.getById(id).then((result) => { if (live) setAttachment(result); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);
  const metadata = attachment || (draftToken ? readAttachmentDraft(draftToken) : undefined);
  const filename = metadata?.file_name || (id ? `附件 #${id}` : '待发布附件');
  const mime = metadata?.mime_type || '';
  const Icon = mime.startsWith('image/') ? FileImage : mime.startsWith('text/') || mime === 'application/pdf' ? FileText : Archive;
  const isForge = /\.(?:msav|msch)$/i.test(filename);
  const content = <><Icon size={18} aria-hidden="true" /><span className="rich-attachment-info"><span className="rich-attachment-name" title={filename}>{filename}</span><span className="rich-attachment-meta">{metadata ? `${mime} · ${formatSize(metadata.file_size)}` : failed ? '附件不可用或无权访问' : id ? '附件正在加载…' : '附件草稿'}</span></span>{attachment && !editing ? <Download size={16} aria-label="下载" /> : <span className="rich-attachment-state">{id ? editing ? '发布后可下载' : failed ? '不可用' : '加载中' : '待发布'}</span>}</>;
  return <div className="rich-attachment-card" data-rich-attachment="true" data-testid="rich-attachment-card">
    {attachment && isForge && attachment.renderer_status === 'ready' && <div className="rich-attachment-preview"><img src={attachmentApi.preview(attachment.id)} alt={`${filename} 预览`} /></div>}
    {attachment && isForge && attachment.renderer_status && !['ready', 'failed'].includes(attachment.renderer_status) && <span className="rich-attachment-preview-status"><Loader2 size={16} className="animate-spin" />正在生成蓝图预览</span>}
    {attachment && !editing ? <a href={attachmentApi.download(attachment.id)} className="rich-attachment-download">{content}</a> : <div className="rich-attachment-row">{content}</div>}
  </div>;
}
