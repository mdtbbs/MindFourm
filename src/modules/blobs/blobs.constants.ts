/** Default namespace for callers that do not choose one. */
export const DEFAULT_BLOB_NAMESPACE = 'default';

/** Names an owner may not claim, because they would shadow future platform buckets. */
export const RESERVED_BLOB_NAMESPACES = ['system', 'admin', 'internal', 'platform'] as const;

/** How long a staged upload session stays committable. */
export const BLOB_UPLOAD_SESSION_MINUTES = 15;

/** Grace period between the last binding going away and the bytes being reclaimed. */
export const BLOB_GC_GRACE_HOURS = 24;

/** Default per-owner storage limit (512 MiB) and per-object limit (64 MiB). */
export const DEFAULT_BLOB_QUOTA_BYTES = 512 * 1024 * 1024;
export const DEFAULT_BLOB_MAX_OBJECT_BYTES = 64 * 1024 * 1024;

/** Retention for the idempotency replay rows. */
export const BLOB_IDEMPOTENCY_TTL_HOURS = 24;

/** Bounds the number of upload sessions one account keeps open at a time. */
export const MAX_OPEN_BLOB_UPLOADS = 20;

/** A declared MIME type must at least look like one. */
export const BLOB_MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

/**
 * Types served inline.
 *
 * The stored MIME type comes from the uploader and is never sniffed, so it can
 * only be trusted as a *hint*. Everything outside this list — including HTML, SVG
 * and every other active-content type — is served as `application/octet-stream`
 * with an attachment disposition, which takes the browser out of the rendering
 * business entirely. Callers that need inline HTML or SVG go through a module
 * that renders and sanitises it (see the public-image upload path), not through
 * this one.
 */
export const INLINE_SAFE_BLOB_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'text/plain',
];
