import { inflateRawSync } from 'zlib';
import { createHash } from 'crypto';
import { parseProperties, summarizeLocalizations } from './mod-localization';

export const MOD_PARSER_VERSION = 'mdtbbs-mod-static-1';
export const MOD_ARCHIVE_LIMITS = {
  maxArchiveBytes: 50 * 1024 * 1024,
  maxEntries: 20_000,
  maxTotalUncompressedBytes: 200 * 1024 * 1024,
  maxEntryUncompressedBytes: 8 * 1024 * 1024,
  maxManifestBytes: 256 * 1024,
  maxContentJsonBytes: 512 * 1024,
  maxPropertiesBytes: 1024 * 1024,
} as const;

type ZipEntry = { name: string; flags: number; method: number; crc: number; compressedSize: number; uncompressedSize: number; localOffset: number; unixMode: number };
export type ModManifest = {
  name: string | null;
  displayName: string | null;
  author: string | null;
  version: string | null;
  minGameVersion: string | null;
  dependencies: Array<{ mod_id: string; kind: 'required' | 'optional' | 'incompatible' | 'embedded'; version_constraint: string | null }>;
  description: string | null;
  icon: string | null;
  main: string | null;
  package: string | null;
  raw: Record<string, unknown>;
};
export type ModContentRecord = {
  content_type: string;
  internal_name: string;
  display_name: string;
  description: string | null;
  icon_key: string | null;
  properties: Record<string, unknown>;
};
export type ModArchiveAnalysis = {
  parser_version: string;
  status: 'complete' | 'partial';
  runtime_type: 'java' | 'js' | 'hybrid' | 'content' | 'unknown';
  manifest_path: string | null;
  manifest_format: 'json' | 'hjson' | null;
  manifest: ModManifest;
  files: Array<{ name: string; sha256: string }>;
  file_index_truncated: boolean;
  java: { entrypoint: string | null; packages: string[]; mindustry_api_references: string[]; arc_api_references: string[]; bundled_dependency_count: number; native_libraries: string[] };
  content: ModContentRecord[];
  localizations: ReturnType<typeof summarizeLocalizations>;
  findings: Array<{ code: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string }>;
};

export class ModUploadValidationError extends Error {
  readonly code = 'MOD_UPLOAD_INVALID';
  constructor(message: string) { super(message); this.name = 'ModUploadValidationError'; }
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeZipName(bytes: Buffer, utf8: boolean): string {
  const name = bytes.toString(utf8 ? 'utf8' : 'latin1').replace(/\\/g, '/');
  if (!name || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new ModUploadValidationError('Mod archive contains an unsafe path');
  const segments = name.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) throw new ModUploadValidationError('Mod archive contains a path traversal entry');
  return name;
}

function locateEndOfCentralDirectory(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new ModUploadValidationError('Mod archive is not a valid ZIP/JAR file');
}

function listZipEntries(buffer: Buffer): ZipEntry[] {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MOD_ARCHIVE_LIMITS.maxArchiveBytes) {
    throw new ModUploadValidationError('Mod archive size is invalid');
  }
  const end = locateEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(end + 4);
  const centralDisk = buffer.readUInt16LE(end + 6);
  const diskCount = buffer.readUInt16LE(end + 8);
  const entryCount = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  if (disk !== 0 || centralDisk !== 0 || diskCount !== entryCount || entryCount > MOD_ARCHIVE_LIMITS.maxEntries
    || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
    || centralOffset + centralSize > end) {
    throw new ModUploadValidationError('Mod archive uses an unsupported or unsafe ZIP layout');
  }
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new ModUploadValidationError('Mod archive central directory is damaged');
    const versionMadeBy = buffer.readUInt16LE(offset + 4);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const startDisk = buffer.readUInt16LE(offset + 34);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const endOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (endOffset > buffer.length || startDisk !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ModUploadValidationError('Mod archive entry uses an unsupported ZIP extension');
    }
    const name = safeZipName(buffer.subarray(offset + 46, offset + 46 + nameLength), Boolean(flags & 0x0800));
    const unix = (versionMadeBy >>> 8) === 3;
    const unixMode = unix ? (externalAttributes >>> 16) & 0xffff : 0;
    const fileType = unixMode & 0xf000;
    if (fileType === 0xa000) throw new ModUploadValidationError('Mod archive contains a symbolic link');
    if (flags & 0x0001) throw new ModUploadValidationError('Encrypted Mod archives are not supported');
    if (![0, 8].includes(method)) throw new ModUploadValidationError('Mod archive compression method is not supported');
    if (uncompressedSize > MOD_ARCHIVE_LIMITS.maxEntryUncompressedBytes) throw new ModUploadValidationError('Mod archive contains an oversized entry');
    totalBytes += uncompressedSize;
    if (totalBytes > MOD_ARCHIVE_LIMITS.maxTotalUncompressedBytes) throw new ModUploadValidationError('Mod archive expands beyond the safety limit');
    const directory = name.endsWith('/') || fileType === 0x4000;
    if (!directory) {
      if (seen.has(name)) throw new ModUploadValidationError('Mod archive contains duplicate file paths');
      seen.add(name);
      entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset, unixMode });
    }
    offset = endOffset;
  }
  return entries;
}

function extractZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const start = entry.localOffset;
  if (start + 30 > buffer.length || buffer.readUInt32LE(start) !== 0x04034b50) throw new ModUploadValidationError('Mod archive entry header is damaged');
  const localFlags = buffer.readUInt16LE(start + 6);
  const localMethod = buffer.readUInt16LE(start + 8);
  const nameLength = buffer.readUInt16LE(start + 26);
  const extraLength = buffer.readUInt16LE(start + 28);
  const dataStart = start + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new ModUploadValidationError('Mod archive entry is truncated');
  const localName = safeZipName(buffer.subarray(start + 30, start + 30 + nameLength), Boolean(localFlags & 0x0800));
  if (localName !== entry.name || (localFlags & 0x0001) || localMethod !== entry.method) throw new ModUploadValidationError('Mod archive entry header does not match its index');
  const compressed = buffer.subarray(dataStart, dataEnd);
  let result: Buffer;
  try {
    result = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize + 1 });
  } catch {
    throw new ModUploadValidationError('Mod archive entry could not be safely decompressed');
  }
  if (result.length !== entry.uncompressedSize) throw new ModUploadValidationError('Mod archive entry size does not match its header');
  if (crc32(result) !== entry.crc) throw new ModUploadValidationError('Mod archive entry checksum is invalid');
  return result;
}

/** Extracts only small metadata entries. It never writes paths to disk or executes archive contents. */
export function readModArchiveMetadataEntries(buffer: Buffer): Map<string, Buffer> & { archiveFiles: Array<{ name: string; sha256: string }>; archiveFileCount: number } {
  const entries = listZipEntries(buffer);
  const result = new Map<string, Buffer>() as Map<string, Buffer> & { archiveFiles: Array<{ name: string; sha256: string }>; archiveFileCount: number };
  result.archiveFiles = [];
  result.archiveFileCount = entries.length;
  const relevant = (name: string) => /(^|\/)(mod\.(json|hjson)|META-INF\/MANIFEST\.MF)$/i.test(name)
    || /^content\/(blocks?|items?|liquids?|units?|planets?|technodes?)\/[^/]+\.json$/i.test(name)
    || /^bundles\/[^/]+\.properties$/i.test(name)
    || name.endsWith('.class');
  for (const entry of entries) {
    const bytes = extractZipEntry(buffer, entry);
    if (result.archiveFiles.length < 5000 && entry.name.length <= 512) {
      result.archiveFiles.push({ name: entry.name, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    // Validate every entry's local header, decompressed length and CRC. Only
    // retain small metadata/class entries for analysis; assets are discarded.
    if (!relevant(entry.name)) continue;
    if (entry.name.endsWith('.class')) {
      if (bytes.length > 2 * 1024 * 1024) continue;
    }
    result.set(entry.name, bytes);
  }
  return result;
}

function parseHjsonScalar(value: string): unknown {
  const trimmed = value.trim().replace(/,$/, '').trim();
  if (!trimmed) return '';
  try { return JSON.parse(trimmed); } catch { /* HJSON uses unquoted strings */ }
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) return trimmed.slice(1, -1);
  if (/^(true|false|null)$/i.test(trimmed)) return trimmed.toLowerCase() === 'null' ? null : trimmed.toLowerCase() === 'true';
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((part) => parseHjsonScalar(part)).filter((part) => part !== '');
  }
  return trimmed.replace(/\s+#.*$/, '').replace(/\s+\/\/.*$/, '').trim();
}

/** Supports JSON and the line-oriented, unquoted HJSON commonly used by Mindustry mods. */
export function parseModManifestText(text: string): { value: Record<string, unknown>; format: 'json' | 'hjson' } {
  if (Buffer.byteLength(text, 'utf8') > MOD_ARCHIVE_LIMITS.maxManifestBytes) throw new ModUploadValidationError('Mod manifest exceeds the size limit');
  const input = text.replace(/^\uFEFF/, '').trim();
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('manifest must be an object');
    return { value: parsed as Record<string, unknown>, format: 'json' };
  } catch (jsonError) {
    const value: Record<string, unknown> = {};
    const lines = input.replace(/^\s*\{/, '').replace(/\}\s*$/, '').split(/\r?\n/);
    for (let line of lines) {
      line = line.trim().replace(/,$/, '').trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      const match = /^(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_.-]+))\s*:\s*(.*?)\s*,?$/.exec(line);
      if (!match) continue;
      const key = match[1] || match[2] || match[3];
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      value[key] = parseHjsonScalar(match[4]);
    }
    if (!Object.keys(value).length) throw new ModUploadValidationError(`Mod manifest is invalid (${(jsonError as Error).message})`);
    return { value, format: 'hjson' };
  }
}

function asString(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).trim();
  return result ? result.slice(0, maxLength) : null;
}

function manifestDependencies(value: unknown, kind: 'required' | 'optional' | 'incompatible' | 'embedded' = 'required') {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
  return items.slice(0, 200).flatMap((item) => {
    const modId = typeof item === 'string' ? item : item && typeof item === 'object' ? asString((item as any).name || (item as any).mod, 128) : null;
    if (!modId || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(modId)) return [];
    const version = item && typeof item === 'object' ? asString((item as any).version || (item as any).versionRange, 160) : null;
    return [{ mod_id: modId, kind, version_constraint: version }];
  });
}

function safeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => safeJsonValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)).slice(0, 500)
      .map(([key, child]) => [key.slice(0, 100), safeJsonValue(child, depth + 1)]));
  }
  return null;
}

function contentTypeForPath(path: string): string | null {
  const value = path.split('/')[1]?.toLowerCase();
  const map: Record<string, string> = { block: 'block', blocks: 'block', item: 'item', items: 'item', liquid: 'liquid', liquids: 'liquid', unit: 'unit', units: 'unit', planet: 'planet', planets: 'planet', technode: 'techNode', technodes: 'techNode', tech: 'techNode' };
  return map[value] || null;
}

function scanContent(entries: ReadonlyMap<string, Buffer>): ModContentRecord[] {
  const results: ModContentRecord[] = [];
  for (const [path, bytes] of entries) {
    if (!/^content\//i.test(path) || !path.toLowerCase().endsWith('.json') || bytes.length > MOD_ARCHIVE_LIMITS.maxContentJsonBytes) continue;
    const contentType = contentTypeForPath(path);
    if (!contentType) continue;
    let value: any;
    try { value = JSON.parse(bytes.toString('utf8')); } catch { continue; }
    const items = Array.isArray(value) ? value.slice(0, 500) : [value];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const internalName = asString(item.name, 128);
      if (!internalName || !/^[A-Za-z0-9_.-]+$/.test(internalName)) continue;
      const known = new Set(['name', 'localizedName', 'description', 'details', 'icon', 'type', 'content', 'requirements']);
      const properties = Object.fromEntries(Object.entries(item).filter(([key]) => !known.has(key)).slice(0, 100).map(([key, child]) => [key, safeJsonValue(child)]));
      results.push({
        content_type: contentType,
        internal_name: internalName,
        display_name: asString(item.localizedName, 255) || internalName,
        description: asString(item.description || item.details, 2000),
        icon_key: asString(item.icon, 500) || null,
        properties: properties as Record<string, unknown>,
      });
      if (results.length >= 50_000) return results;
    }
  }
  return results;
}

function readJavaProperties(text: string): Record<string, string> {
  return Object.fromEntries(parseProperties(text, MOD_ARCHIVE_LIMITS.maxPropertiesBytes));
}

function normalizeManifest(raw: Record<string, unknown>): ModManifest {
  const dependencies = [
    ...manifestDependencies(raw.dependencies, 'required'),
    ...manifestDependencies(raw.softDependencies ?? raw.optionalDependencies, 'optional'),
    ...manifestDependencies(raw.incompatibleMods ?? raw.incompatible, 'incompatible'),
    ...manifestDependencies(raw.embeddedDependencies ?? raw.embedded, 'embedded'),
  ];
  const deduped = [...new Map(dependencies.map((item) => [`${item.kind}:${item.mod_id}`, item])).values()];
  return {
    name: asString(raw.name, 255),
    displayName: asString(raw.displayName ?? raw.display_name, 255),
    author: asString(raw.author, 255),
    version: asString(raw.version, 50),
    minGameVersion: asString(raw.minGameVersion ?? raw.min_game_version, 50),
    dependencies: deduped,
    description: asString(raw.description, 20_000),
    icon: asString(raw.icon, 500),
    main: asString(raw.main ?? raw.mainClass, 255),
    package: asString(raw.package, 255),
    raw: safeJsonValue(raw) as Record<string, unknown>,
  };
}

function inferRuntime(names: string[]): ModArchiveAnalysis['runtime_type'] {
  const java = names.some((name) => name.endsWith('.class'));
  const js = names.some((name) => /\.(?:js|mjs)$/i.test(name) && !/(?:^|\/)(?:scripts\/)?bundles?\//i.test(name));
  if (java && js) return 'hybrid';
  if (java) return 'java';
  if (js) return 'js';
  if (names.some((name) => /^content\//i.test(name))) return 'content';
  return 'unknown';
}

function buildClassAnalysis(entries: ReadonlyMap<string, Buffer>, manifest: ModManifest) {
  const classes = [...entries].filter(([name]) => name.endsWith('.class')).slice(0, 20_000);
  const packages = new Set<string>(); const mindustry = new Set<string>(); const arc = new Set<string>();
  for (const [name, bytes] of classes) {
    const className = name.replace(/\.class$/, '').replace(/\//g, '.');
    const index = className.lastIndexOf('.');
    if (index > 0) packages.add(className.slice(0, index));
    // Constant-pool text is inspected as bytes only; no classloader or JVM is invoked.
    const ascii = bytes.toString('latin1');
    for (const match of ascii.matchAll(/(?:mindustry|arc)[/.][A-Za-z0-9_$/.-]{1,160}/g)) {
      const reference = match[0].replace(/\//g, '.');
      if (reference.startsWith('mindustry.')) mindustry.add(reference.slice(0, 180));
      if (reference.startsWith('arc.')) arc.add(reference.slice(0, 180));
    }
  }
  const javaManifest = entries.get('META-INF/MANIFEST.MF')?.toString('utf8') || '';
  const mainClass = /^Main-Class:\s*([^\r\n]+)/im.exec(javaManifest)?.[1]?.trim() || null;
  const nativeLibraries = [...entries.keys()].filter((name) => /(?:^|\/)(?:[^/]+\.(?:so|dll|dylib)|lib[^/]+\.jnilib)$/i.test(name)).slice(0, 200);
  const bundledDependencyCount = [...entries.keys()].filter((name) => /(?:^|\/)[^/]+\.jar$/i.test(name)).length;
  return {
    entrypoint: manifest.main || mainClass,
    packages: [...packages].sort().slice(0, 500),
    mindustry_api_references: [...mindustry].sort().slice(0, 500),
    arc_api_references: [...arc].sort().slice(0, 500),
    bundled_dependency_count: bundledDependencyCount,
    native_libraries: nativeLibraries,
  };
}

/**
 * Analyzes a Mod ZIP/JAR as untrusted data. No uploaded bytecode, JavaScript,
 * class initializer, or native library is executed.
 */
export function analyzeModArchive(buffer: Buffer): ModArchiveAnalysis {
  const entries = readModArchiveMetadataEntries(buffer);
  const manifestCandidates = [...entries.keys()].filter((name) => /(^|\/)mod\.(json|hjson)$/i.test(name))
    .sort((left, right) => left.length - right.length || left.localeCompare(right));
  const manifestPath = manifestCandidates[0] || null;
  let manifestFormat: ModArchiveAnalysis['manifest_format'] = null;
  let manifest = normalizeManifest({});
  const findings: ModArchiveAnalysis['findings'] = [];
  const fileIndexTruncated = entries.archiveFiles.length < entries.archiveFileCount;
  if (fileIndexTruncated) findings.push({ code: 'mod_archive_file_index_truncated', severity: 'WARNING', message: 'The archive file list is too large to index completely for version diffs.' });
  if (manifestPath) {
    try {
      const parsed = parseModManifestText(entries.get(manifestPath)!.toString('utf8'));
      manifestFormat = parsed.format;
      manifest = normalizeManifest(parsed.value);
    } catch (error) {
      findings.push({ code: 'mod_manifest_parse_failed', severity: 'WARNING', message: error instanceof Error ? error.message : 'Mod manifest could not be parsed' });
    }
  } else {
    findings.push({ code: 'mod_manifest_missing', severity: 'WARNING', message: 'No mod.json or mod.hjson manifest was found' });
  }
  const names = [...entries.keys()];
  const runtimeType = inferRuntime(names);
  if (runtimeType === 'unknown') findings.push({ code: 'mod_runtime_unknown', severity: 'INFO', message: 'The package does not contain a recognized JavaScript, Java, or content entry' });
  const bundles = new Map<string, string>();
  for (const [name, bytes] of entries) {
    if (!/^bundles\/[^/]+\.properties$/i.test(name)) continue;
    const basename = name.slice('bundles/'.length, -'.properties'.length);
    const locale = basename === 'bundle' ? 'en' : basename.replace(/^bundle[_-]?/i, '').replace(/_/g, '-');
    bundles.set(locale, bytes.toString('utf8'));
  }
  const sourceBundle = bundles.get('en') || bundles.get('en-US') || bundles.get('en-UK') || [...bundles.values()][0] || '';
  const localizations = sourceBundle ? summarizeLocalizations(sourceBundle, Object.fromEntries([...bundles].filter(([locale]) => locale !== 'en'))) : [];
  const java = buildClassAnalysis(entries, manifest);
  return {
    parser_version: MOD_PARSER_VERSION,
    status: findings.some((finding) => finding.severity === 'WARNING') ? 'partial' : 'complete',
    runtime_type: runtimeType,
    manifest_path: manifestPath,
    manifest_format: manifestFormat,
    manifest,
    files: entries.archiveFiles,
    file_index_truncated: fileIndexTruncated,
    java,
    content: scanContent(entries),
    localizations,
    findings,
  };
}

const OVERRIDABLE_FIELDS = new Set(['name', 'displayName', 'author', 'version', 'minGameVersion', 'dependencies', 'description', 'icon', 'main', 'package']);

/** Stores parsed and publisher-supplied data separately and never mutates parser output. */
export function applyModAuthorOverrides(parsed: ModManifest, overrides: Record<string, unknown> | null | undefined): ModManifest {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return parsed;
  const next: Record<string, unknown> = { ...parsed.raw };
  for (const [key, value] of Object.entries(overrides).slice(0, OVERRIDABLE_FIELDS.size)) {
    if (!OVERRIDABLE_FIELDS.has(key)) continue;
    if (key === 'dependencies') {
      next[key] = manifestDependencies(value, 'required').map((item) => ({ name: item.mod_id, version: item.version_constraint }));
    } else {
      const text = asString(value, key === 'description' ? 20_000 : 500);
      if (text !== null) next[key] = text;
    }
  }
  return normalizeManifest(next);
}

export function validateModManifest(manifest: ModManifest): Array<{ code: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string }> {
  const findings: Array<{ code: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string }> = [];
  if (!manifest.name && !manifest.displayName) findings.push({ code: 'mod_name_missing', severity: 'WARNING', message: 'Add a Mod name or display name before publishing' });
  if (!manifest.version) findings.push({ code: 'mod_version_missing', severity: 'WARNING', message: 'The package does not declare a version' });
  if (manifest.main && !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(manifest.main)) findings.push({ code: 'mod_entrypoint_invalid', severity: 'ERROR', message: 'The declared Java entrypoint is not a valid class name' });
  return findings;
}
