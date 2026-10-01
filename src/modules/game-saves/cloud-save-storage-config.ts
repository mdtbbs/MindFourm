import { isAbsolute, parse, resolve } from 'node:path';

export function isCloudSaveStorageConfigured(storagePath: string | null | undefined): boolean {
  if (!storagePath || !isAbsolute(storagePath)) return false;
  const normalized = resolve(storagePath);
  return normalized === storagePath && normalized !== parse(normalized).root;
}
