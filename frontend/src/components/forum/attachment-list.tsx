'use client';

import { Attachment } from '@/types';
import { attachmentApi } from '@/lib/api/client';
import { FileImage, FileText, Archive, Download } from 'lucide-react';

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
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.mime_type.startsWith('image/'));
  const files = attachments.filter((a) => !a.mime_type.startsWith('image/'));

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
