import { analyzeModArchive, applyModAuthorOverrides, ModUploadValidationError, parseModManifestText } from './mod-package-parser';
import { diffModContent, diffModVersion } from './mod-content-diff';
import { resolveModDependencies } from './mod-dependency-resolver';
import { parseProperties, summarizeLocalizations } from './mod-localization';
import { compareResourceVersions, satisfiesVersionRange, validateResourceVersion } from './version-constraint.util';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(files: Record<string, string | Buffer>): Buffer {
  const local: Buffer[] = []; const central: Buffer[] = [];
  let localOffset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8'); const content = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8); localHeader.writeUInt32LE(checksum, 14); localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22); localHeader.writeUInt16LE(nameBytes.length, 26);
    local.push(localHeader, nameBytes, content);

    const directoryHeader = Buffer.alloc(46);
    directoryHeader.writeUInt32LE(0x02014b50, 0); directoryHeader.writeUInt16LE(0x0314, 4); directoryHeader.writeUInt16LE(20, 6);
    directoryHeader.writeUInt16LE(0x0800, 8); directoryHeader.writeUInt16LE(0, 10); directoryHeader.writeUInt32LE(checksum, 16);
    directoryHeader.writeUInt32LE(content.length, 20); directoryHeader.writeUInt32LE(content.length, 24);
    directoryHeader.writeUInt16LE(nameBytes.length, 28); directoryHeader.writeUInt32LE(0x81a40000, 38);
    directoryHeader.writeUInt32LE(localOffset, 42);
    central.push(directoryHeader, nameBytes);
    localOffset += localHeader.length + nameBytes.length + content.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

describe('Resource Center V2 Mod analyzer primitives', () => {
  it('validates semantic versions and evaluates bounded compatibility ranges', () => {
    expect(validateResourceVersion('1.2.3-beta.1', 'semver')).toBe('1.2.3-beta.1');
    expect(() => validateResourceVersion('v157', 'semver')).toThrow();
    expect(validateResourceVersion('v157', 'compatibility')).toBe('v157');
    expect(compareResourceVersions('1.2.3-alpha', '1.2.3')).toBeLessThan(0);
    expect(satisfiesVersionRange('1.5.0', '>=1.2 <2.0')).toBe(true);
    expect(satisfiesVersionRange('2.0.0', '>=1.2 <2.0')).toBe(false);
    expect(satisfiesVersionRange('1.2.8', '~1.2.0')).toBe(true);
    expect(satisfiesVersionRange('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfiesVersionRange('0.2.8', '^0.2.3')).toBe(true);
    expect(satisfiesVersionRange('0.3.0', '^0.2.3')).toBe(false);
    expect(satisfiesVersionRange('v157', '>=v156 <v158')).toBe(true);
  });

  it('resolves dependencies, reports missing targets and cycles, and stops at limits', () => {
    const root = { mod_id: 'root', title: 'Root', version: '1.0.0', dependencies: [{ mod_id: 'dep', kind: 'required' as const }] };
    const dep = { mod_id: 'dep', title: 'Dependency', version: '2.0.0', dependencies: [{ mod_id: 'root', kind: 'required' as const }, { mod_id: 'missing', kind: 'optional' as const, upstream_url: 'https://example.invalid/mod' }] };
    const result = resolveModDependencies(root, new Map([['dep', dep]]));
    expect(result.direct[0]).toMatchObject({ mod_id: 'dep', status: 'resolved' });
    expect(result.cycles).toEqual([['root', 'dep', 'root']]);
    expect(result.unresolved).toEqual([{ mod_id: 'missing', kind: 'optional', constraint: null, upstream_url: 'https://example.invalid/mod' }]);
    expect(result.warnings).toContain('dependency_cycle');
    const limited = resolveModDependencies(root, new Map([['dep', dep]]), { max_depth: 1 });
    expect(limited.truncated).toBe(true);
  });

  it('indexes valid JSON and HJSON manifests while keeping author overrides separate', () => {
    expect(parseModManifestText('{"name":"json-mod"}')).toMatchObject({ format: 'json', value: { name: 'json-mod' } });
    const parsed = parseModManifestText('name: example\ndisplayName: Example Mod\nversion: 1.2.0\ndependencies: [base, ui]');
    expect(parsed).toMatchObject({ format: 'hjson', value: { name: 'example', version: '1.2.0', dependencies: ['base', 'ui'] } });
    const overrides = applyModAuthorOverrides({
      name: 'example', displayName: null, author: null, version: '1.2.0', minGameVersion: null,
      dependencies: [], description: null, icon: null, main: null, package: null, raw: { name: 'example' },
    }, { displayName: 'Publisher Title', ignored_database_id: 42 });
    expect(overrides.displayName).toBe('Publisher Title');
    expect(overrides.raw).not.toHaveProperty('ignored_database_id');
    expect(overrides.raw).not.toBe(parsed.value);
  });

  it('scans a JAR as data, extracts content and localization, and reports static Java references', () => {
    const archive = makeStoredZip({
      'mod.hjson': 'name: demo\ndisplayName: Demo Mod\nauthor: Tester\nversion: 1.2.0\nminGameVersion: 157\ndependencies: [base]',
      'demo/Main.class': Buffer.from('mindustry/game/Mods$Mod arc/Core'),
      'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nMain-Class: demo.Main\n',
      'content/blocks/demo.json': '{"name":"demo-block","localizedName":"Demo Block","health":240}',
      'bundles/bundle.properties': 'item.a=Alpha\nitem.b=Beta\n',
      'bundles/bundle_zh_CN.properties': 'item.a=甲\n',
    });
    const result = analyzeModArchive(archive);
    expect(result).toMatchObject({ status: 'complete', runtime_type: 'java', manifest_format: 'hjson' });
    expect(result.java.entrypoint).toBe('demo.Main');
    expect(result.java.packages).toContain('demo');
    expect(result.java.mindustry_api_references.some((item) => item.includes('mindustry.game'))).toBe(true);
    expect(result.java.arc_api_references.some((item) => item.includes('arc.Core'))).toBe(true);
    expect(result.content).toEqual([expect.objectContaining({ content_type: 'block', internal_name: 'demo-block', display_name: 'Demo Block' })]);
    expect(result.localizations).toEqual([expect.objectContaining({ locale: 'zh-CN', translated: 1, total: 2, percentage: 50, missing_keys: ['item.b'] })]);
  });

  it('rejects path traversal and bad checksums as upload validation failures', () => {
    expect(() => analyzeModArchive(makeStoredZip({ '../mod.json': '{"name":"bad"}' }))).toThrow(ModUploadValidationError);
    const corrupt = makeStoredZip({ 'mod.json': '{"name":"test"}' });
    corrupt[30 + Buffer.byteLength('mod.json')] ^= 0xff;
    expect(() => analyzeModArchive(corrupt)).toThrow(ModUploadValidationError);
    expect(() => analyzeModArchive(Buffer.from('not-a-zip'))).toThrow(ModUploadValidationError);
  });

  it('diffs Content with declared renames and computes file and manifest changes', () => {
    const diff = diffModContent(
      [{ content_type: 'block', internal_name: 'old', display_name: 'Old' }, { content_type: 'item', internal_name: 'gone' }],
      [{ content_type: 'block', internal_name: 'new', display_name: 'New' }, { content_type: 'unit', internal_name: 'added' }],
      [{ content_type: 'block', old_internal_name: 'old', new_internal_name: 'new' }],
    );
    expect(diff.map((item) => `${item.status}:${item.content_type}`)).toEqual(['renamed:block', 'removed:item', 'added:unit']);
    const versionDiff = diffModVersion(
      { manifest: { version: '1' }, content: [], dependencies: [], files: [{ name: 'mod.jar', sha256: 'old' }] },
      { manifest: { version: '2' }, content: [{ content_type: 'block', internal_name: 'x' }], dependencies: [], files: [{ name: 'mod.jar', sha256: 'new' }, { name: 'readme', sha256: 'readme' }] },
    );
    expect(versionDiff.summary).toMatchObject({ changed_manifest_fields: 1, added_content: 1, changed_files: 1, added_files: 1 });
  });

  it('parses escaped localization keys and reports missing translated strings', () => {
    expect(parseProperties('escaped\\ key=hello\\nworld\nvalue\\:part: yes').get('escaped key')).toBe('hello\nworld');
    expect(summarizeLocalizations('a=One\nb=Two\n', { 'zh-CN': 'a=一\n' })).toEqual([
      { locale: 'zh-CN', translated: 1, total: 2, percentage: 50, missing_keys: ['b'] },
    ]);
  });
});
