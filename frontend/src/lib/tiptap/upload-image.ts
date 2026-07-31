import { attachmentApi } from '@/lib/api/client';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface UploadImageResult {
  url: string;
  alt: string;
  id: number;
}

/**
 * Upload an image file to the attachment endpoint and return its download URL.
 *
 * Validates file type and size client-side before uploading. Throws on invalid
 * files or upload failure so the caller can show an error state.
 */
export async function uploadImage(file: File): Promise<UploadImageResult> {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error(`不支持的图片格式：${file.type || '未知'}。支持 PNG、JPG、GIF、WebP`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`图片过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大 10MB`);
  }

  const formData = new FormData();
  formData.append('files', file);
  const result = await attachmentApi.upload(formData);
  const attachment = Array.isArray(result) ? result[0] : result;

  if (!attachment?.id) {
    throw new Error('上传成功但未返回文件信息');
  }

  return {
    url: attachmentApi.download(attachment.id),
    alt: attachment.file_name || file.name || 'image',
    id: attachment.id,
  };
}

/** Check if a File is an image we can upload. */
export function isUploadableImage(file: File): boolean {
  return IMAGE_TYPES.has(file.type) && file.size <= MAX_FILE_SIZE;
}

/** Extract image files from a DataTransfer (paste or drop). */
export function extractImageFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const files: File[] = [];
  // Prefer .files for drop events; .items for paste events (which may include non-file items)
  if (dataTransfer.files?.length) {
    for (const file of Array.from(dataTransfer.files)) {
      if (isUploadableImage(file)) files.push(file);
    }
  }
  return files;
}
