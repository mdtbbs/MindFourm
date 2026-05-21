'use client';

import { useRef, useState } from 'react';
import { attachmentApi } from '@/lib/api/client';
import { Attachment } from '@/types';
import { Paperclip, X } from 'lucide-react';

interface FileUploadProps {
  postId?: number;
  replyId?: number;
  onUploaded?: (attachments: Attachment[]) => void;
}

const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'application/zip', 'application/x-rar-compressed',
  'application/x-7z-compressed', 'text/plain', 'text/markdown',
];

export default function FileUpload({ postId, replyId, onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList) => {
    const validFiles = Array.from(files).filter((f) => ALLOWED_TYPES.includes(f.type));
    if (validFiles.length === 0) {
      setError('不支持的文件类型');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const file of validFiles) {
        formData.append('files', file);
      }
      if (postId !== undefined) formData.append('post_id', String(postId));
      if (replyId !== undefined) formData.append('reply_id', String(replyId));

      const result = await attachmentApi.upload(formData);
      const attachments = Array.isArray(result) ? result : [result];
      onUploaded?.(attachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-surface-300 dark:border-gray-600 text-surface-600 dark:text-gray-300 hover:bg-surface-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <Paperclip className="w-4 h-4" />
          {uploading ? '上传中...' : '上传附件'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.zip,.rar,.7z,.txt,.md"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <span className="text-xs text-surface-400 dark:text-gray-500">
          PNG, JPG, GIF, PDF, ZIP (最大 10MB)
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
