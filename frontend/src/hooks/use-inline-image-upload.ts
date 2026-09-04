'use client';

import { useRef, useState, useCallback } from 'react';
import { isUploadableImage, uploadImage } from '@/lib/tiptap/upload-image';

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

/**
 * Inline image upload for Markdown editors.
 *
 * Images can be selected before their parent post/reply exists, so this must use
 * the public editor-image endpoint rather than moderated attachments (which
 * require a post_id or reply_id). Non-image files are ignored so surrounding
 * text editing is unaffected.
 */
export default function useInlineImageUpload({
  insertMarkdown,
}: UseInlineImageUploadOptions): UseInlineImageUploadReturn {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null!);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter(isUploadableImage);
      if (images.length === 0) return;

      setUploading(true);
      try {
        for (const file of images) {
          const result = await uploadImage(file);
          insertMarkdown(`![${result.alt}](${result.url})`);
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
