'use client';

import { useEffect, useState } from 'react';
import { Attachment } from '@/types';
import { attachmentApi } from '@/lib/api/client';
import { FileImage, FileText, Archive, Download, Loader2, Map } from 'lucide-react';

interface AttachmentListProps {
  attachments: Attachment[];
}

function fileIcon(mime_type: string) {
  if (mime_type.startsWith('image/')) return FileImage;
  if (mime_type.startsWith('text/') || mime_type === 'application/pdf') return FileText;
  return Archive;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentList({ attachments }: AttachmentListProps) {
  const [visibleAttachments, setVisibleAttachments] = useState(attachments);

  useEffect(() => {
    setVisibleAttachments(attachments);
  }, [attachments]);

  useEffect(() => {
    const pending = visibleAttachments.filter((file) => /\.(msav|msch)$/i.test(file.file_name) && file.renderer_resource_id && !['ready', 'failed'].includes(file.renderer_status || ''));
    if (pending.length === 0) return;
    let disposed = false;
    const refresh = async () => {
      const updates = await Promise.all(pending.map((file) => attachmentApi.renderStatus(file.id).catch(() => file)));
      if (!disposed) setVisibleAttachments((current) => current.map((file) => updates.find((update) => update.id === file.id) || file));
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [visibleAttachments]);

  if (visibleAttachments.length === 0) return null;

  const images = visibleAttachments.filter((a) => a.mime_type.startsWith('image/'));
  const files = visibleAttachments.filter((a) => !a.mime_type.startsWith('image/'));
  const rendered = files.filter((file) => /\.(msav|msch)$/i.test(file.file_name));

  return (
    <div className="mt-4 space-y-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((img) => (
            <a
              key={img.id}
              href={attachmentApi.download(img.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-video bg-surface-100 dark:bg-gray-800 rounded-lg overflow-hidden"
            >
              <img
                src={attachmentApi.download(img.id)}
                alt={img.file_name}
                className="w-full h-full object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {rendered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {rendered.map((file) => (
            <div key={`preview-${file.id}`} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
              {file.renderer_status === 'ready' ? (
                <a href={attachmentApi.download(file.id)} target="_blank" rel="noopener noreferrer" className="block aspect-video bg-black/10">
                  <img src={attachmentApi.preview(file.id)} alt={`${file.file_name} 预览`} className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center gap-2 px-4 text-center text-sm text-[var(--text-muted)]">
                  {file.renderer_status === 'failed' ? <Map className="h-5 w-5" /> : <Loader2 className="h-5 w-5 animate-spin" />}
                  <span>{file.renderer_status === 'failed' ? '地图/蓝图预览生成失败' : '正在生成地图/蓝图预览…'}</span>
                </div>
              )}
              <a href={attachmentApi.download(file.id)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--primary)]">
                <Map className="h-3.5 w-3.5" /> {file.file_name}
              </a>
            </div>
          ))}
        </div>
      )}

      {/* File downloads */}
      {files.length > 0 && (
        <div className="bg-surface-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-medium text-surface-700 dark:text-gray-300">附件</h4>
          {files.map((f) => {
            const Icon = fileIcon(f.mime_type);
            return (
              <a
                key={f.id}
                href={attachmentApi.download(f.id)}
                className="flex items-center gap-3 text-sm text-surface-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{f.file_name}</span>
                <span className="text-surface-400 dark:text-gray-500 text-xs">{formatSize(f.file_size)}</span>
                <Download className="w-3.5 h-3.5" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
