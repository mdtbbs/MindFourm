import { isAbsolute, parse, resolve } from 'node:path';

/**
 * Whether a configured storage path is usable as a filesystem root for objects.
 *
 * Used by both cloud saves and generic blobs. The check is deliberately strict:
 * a relative path would resolve against `cwd` and move when the process is
 * restarted from elsewhere, and the filesystem root is never a valid object
 * directory.
 */
export function isAbsoluteStoragePath(storagePath: string | null | undefined): boolean {
  if (!storagePath || !isAbsolute(storagePath)) return false;
  const normalized = resolve(storagePath);
  return normalized === storagePath && normalized !== parse(normalized).root;
}
