'use client';

import { useRef, useState, useCallback } from 'react';
import { attachmentApi } from '@/lib/api/client';

interface UseInlineImageUploadOptions {
  /** Insert markdown at the cursor position. Called once per uploaded image. */
  insertMarkdown: (text: string) => void;
}

interface UseInlineImageUploadReturn {
  uploading: boolean;
  /** Hidden file input ref; attach to an <input type="file" />. */
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Open the native file picker for images. */
  triggerImagePicker: () => void;
  /** Handle a paste event; uploads image files found in the clipboard. */
  handlePaste: (event: React.ClipboardEvent) => void;
  /** Handle a drop event; uploads image files found in the dataTransfer. */
  handleDrop: (event: React.DragEvent) => void;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Inline image upload for Markdown editors.
 *
 * Uploads pasted, dropped, or picked image files to the attachment endpoint,
 * then calls `insertMarkdown` with a `![filename](url)` snippet so the editor
 * can place it at the cursor. Non-image files are silently ignored so the
 * surrounding text edit is unaffected.
 */
export default function useInlineImageUpload({
  insertMarkdown,
}: UseInlineImageUploadOptions): UseInlineImageUploadReturn {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null!);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter(
        (f) => IMAGE_TYPES.has(f.type) && f.size <= MAX_FILE_SIZE,
      );
      if (images.length === 0) return;

      setUploading(true);
      try {
        for (const file of images) {
          const formData = new FormData();
          formData.append('files', file);
          const result = await attachmentApi.upload(formData);
          const attachments = Array.isArray(result) ? result : [result];
          if (attachments.length > 0 && attachments[0].id) {
            const url = attachmentApi.download(attachments[0].id);
            const alt = attachments[0].file_name || file.name || 'image';
            insertMarkdown(`![${alt}](${url})`);
          }
        }
      } catch (err) {
        console.error('Inline image upload failed:', err);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [insertMarkdown],
  );

  const triggerImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;
      event.preventDefault();
      uploadFiles(files);
    },
    [uploadFiles],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length === 0) return;
      event.preventDefault();
      uploadFiles(files);
    },
    [uploadFiles],
  );

  return {
    uploading,
    fileInputRef,
    triggerImagePicker,
    handlePaste,
    handleDrop,
  };
}
