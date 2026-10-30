import { createHash } from 'crypto';
import { isAbsolute } from 'path';
import { HttpStatus } from '@nestjs/common';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';

export type NormalizedSaveMetadata = {
  game_version: string | null; game_build: number | null; map_name: string | null;
  wave: number | null; playtime_seconds: string | null; // string: MySQL BIGINT UNSIGNED comes back as a string
  mods_manifest_json: Array<Record<string, string | null>> | null; mods_manifest_hash: string | null;
};

// Same shape as class-validator's IsUUID('4'); the loose length check let
// cursor values like "------------------------------------" reach the query.
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function shouldCreateConflictCopy(resolution: string, hasConflict: boolean): boolean {
  return resolution === 'create_conflict_copy' && hasConflict;
}

export function normalizeCloudSaveName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApiV1Exception('SAVE_INVALID_METADATA', HttpStatus.BAD_REQUEST, '存档名称无效。');
  }
  return name;
}

export function normalizeSaveMetadata(input: any, maxMods: number, maxBytes: number): NormalizedSaveMetadata {
  const gameVersion = boundedString(input?.game?.version, 32, 'game.version');
  const gameBuild = optionalInteger(input?.game?.build, 0, 2147483647, 'game.build');
  const mapName = boundedString(input?.save?.map_name, 160, 'save.map_name');
  const wave = optionalInteger(input?.save?.wave, 0, 2147483647, 'save.wave');
  const playtime = optionalInteger(input?.save?.playtime_seconds, 0, Number.MAX_SAFE_INTEGER, 'save.playtime_seconds');
  let mods: Array<Record<string, string | null>> | null = null;
  let modsHash: string | null = null;
  if (input?.mods !== undefined) {
    if (!Array.isArray(input.mods) || input.mods.length > maxMods) invalid('mods');
    mods = input.mods.map((mod: any) => {
      if (!mod || typeof mod !== 'object' || Array.isArray(mod)) invalid('mods');
      const id = boundedString(mod.id, 100, 'mods.id');
      const name = boundedString(mod.name, 160, 'mods.name');
      if (!id && !name) invalid('mods.id');
      const version = boundedString(mod.version, 64, 'mods.version');
      const sha256 = mod.sha256 == null ? null : String(mod.sha256);
      if (sha256 !== null && !/^[a-f0-9]{64}$/.test(sha256)) invalid('mods.sha256');
      return { id, name, version, sha256 };
    }).sort((a: any, b: any) => {
      const left = a.id || a.name || '';
      const right = b.id || b.name || '';
      return left < right ? -1 : left > right ? 1 : 0;
    });
    const canonical = JSON.stringify(mods);
    if (Buffer.byteLength(canonical, 'utf8') > maxBytes) invalid('mods');
    modsHash = createHash('sha256').update(canonical).digest('hex');
  }
  return {
    game_version: gameVersion, game_build: gameBuild, map_name: mapName, wave,
    playtime_seconds: playtime === null ? null : String(playtime),
    mods_manifest_json: mods, mods_manifest_hash: modsHash,
  };
}

export const MANIFEST_FORMAT = 'copper-save-manifest-v1';

export type NormalizedManifestFile = { path: string; size: number; sha256: string };
export type NormalizedManifest = {
  format: typeof MANIFEST_FORMAT;
  files: NormalizedManifestFile[];
  total_size: number;
  manifest_hash: string;
};

/**
 * Validate a client manifest before it reaches storage.
 *
 * Paths are data-directory relative and are never normalized or rewritten:
 * a client that sends `a/../b` gets an error instead of a silently different
 * file set, and two spellings that resolve to the same entry are rejected as
 * duplicates rather than silently collapsing.
 */
export function normalizeManifest(
  input: unknown,
  maxFiles: number,
  maxFileBytes: number,
  maxManifestBytes: number,
): NormalizedManifest {
  const filesInput = Array.isArray(input) ? input : (input as any)?.files;
  if (!Array.isArray(filesInput) || filesInput.length === 0) manifestInvalid('manifest.files');
  if (filesInput.length > maxFiles) manifestLimitExceeded();
  const seen = new Set<string>();
  const files: NormalizedManifestFile[] = filesInput.map((entry: any) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) manifestInvalid('manifest.files');
    const path = normalizeManifestPath(entry.path);
    if (seen.has(path)) {
      throw new ApiV1Exception('SAVE_MANIFEST_INVALID', HttpStatus.BAD_REQUEST, '存档清单包含重复路径。', false, [{ field: 'manifest.files.path', path }]);
    }
    seen.add(path);
    const size = entry.size;
    if (!Number.isSafeInteger(size) || size <= 0) manifestInvalid('manifest.files.size');
    if (size > maxFileBytes) {
      throw new ApiV1Exception('SAVE_FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, '清单内单个文件超过大小限制。', false, [{ field: 'manifest.files.size', path }]);
    }
    const sha256 = String(entry.sha256 || '');
    if (!/^[a-f0-9]{64}$/.test(sha256)) manifestInvalid('manifest.files.sha256');
    return { path, size: Number(size), sha256 };
  });
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (!Number.isSafeInteger(totalSize)) manifestInvalid('manifest.files');
  const canonical = JSON.stringify({
    format: MANIFEST_FORMAT,
    files: [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
  });
  if (Buffer.byteLength(canonical, 'utf8') > maxManifestBytes) manifestLimitExceeded();
  return {
    format: MANIFEST_FORMAT,
    files,
    total_size: totalSize,
    manifest_hash: createHash('sha256').update(canonical).digest('hex'),
  };
}

function normalizeManifestPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) manifestInvalid('manifest.files.path');
  if (value !== value.trim()) manifestInvalid('manifest.files.path');
  // Backslashes and drive/ADS colons are rejected rather than translated, so a
  // Windows client cannot smuggle a path that the server would interpret as
  // something other than the literal entry name it stores.
  if (/[\u0000-\u001f\u007f\\:]/.test(value)) manifestInvalid('manifest.files.path');
  if (value.startsWith('/') || value.endsWith('/') || isAbsolute(value)) manifestInvalid('manifest.files.path');
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) manifestInvalid('manifest.files.path');
  return value;
}

export function normalizeHashList(input: unknown, maxItems: number): string[] {
  if (!Array.isArray(input)) manifestInvalid('sha256');
  if (input.length > maxItems) manifestLimitExceeded();
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const hash = String(item);
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new ApiV1Exception('SAVE_INVALID_HASH', HttpStatus.BAD_REQUEST, 'SHA-256 格式无效。', false, [{ field: 'sha256' }]);
    }
    if (!seen.has(hash)) {
      seen.add(hash);
      unique.push(hash);
    }
  }
  return unique;
}

function manifestInvalid(field: string): never {
  throw new ApiV1Exception('SAVE_MANIFEST_INVALID', HttpStatus.BAD_REQUEST, '存档清单无效。', false, [{ field }]);
}

function manifestLimitExceeded(): never {
  throw new ApiV1Exception('SAVE_MANIFEST_LIMIT_EXCEEDED', HttpStatus.PAYLOAD_TOO_LARGE, '存档清单超出限制。');
}

export function encodeSaveCursor(createdAt: Date | string, id: string): string {
  return Buffer.from(JSON.stringify({ updated_at: new Date(createdAt).toISOString(), id }), 'utf8').toString('base64url');
}

export function decodeSaveCursor(cursor?: string): { updated_at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof value?.id !== 'string' || !UUID_V4_PATTERN.test(value.id) || !Number.isFinite(Date.parse(value.updated_at))) throw new Error();
    return { updated_at: new Date(value.updated_at).toISOString(), id: value.id };
  } catch {
    throw new ApiV1Exception('SAVE_INVALID_METADATA', HttpStatus.BAD_REQUEST, '分页游标无效。');
  }
}

function boundedString(value: unknown, max: number, field: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(field);
  return value.trim() || null;
}

function optionalInteger(value: unknown, min: number, max: number, field: string): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) invalid(field);
  return Number(value);
}

function invalid(field: string): never {
  throw new ApiV1Exception('SAVE_INVALID_METADATA', HttpStatus.BAD_REQUEST, '存档元数据无效。', false, [{ field }]);
}
