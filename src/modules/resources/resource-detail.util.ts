import { isSafeExternalUrl } from '@common/utils/safe-url.util';

export interface ResourceDetailMetadata {
  cover_image_url: string | null;
  gallery_images: string[];
  tags: string[];
  supported_versions: string[];
  compatibility: string[];
  changelog: string | null;
}

const emptyMetadata = (): ResourceDetailMetadata => ({
  cover_image_url: null,
  gallery_images: [],
  tags: [],
  supported_versions: [],
  compatibility: [],
  changelog: null,
});

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 30);
}

function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith('/') || isSafeExternalUrl(url)) return url;
  return null;
}

export function normalizeResourceMetadata(value: unknown): ResourceDetailMetadata {
  const raw = parseMetadata(value);
  return {
    cover_image_url: safeImageUrl(raw.cover_image_url),
    gallery_images: stringList(raw.gallery_images).map(safeImageUrl).filter((url): url is string => Boolean(url)),
    tags: stringList(raw.tags),
    supported_versions: stringList(raw.supported_versions),
    compatibility: stringList(raw.compatibility),
    changelog: typeof raw.changelog === 'string' ? raw.changelog.slice(0, 20000) : null,
  };
}

export function mergeResourceMetadata(current: unknown, next: unknown): ResourceDetailMetadata {
  const incoming = parseMetadata(next);
  return normalizeResourceMetadata({ ...parseMetadata(current), ...incoming });
}
