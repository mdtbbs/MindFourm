import { MultiplayerModCatalogService } from './multiplayer-mod-catalog.service';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const catalogRow = (overrides: Record<string, unknown> = {}) => ({
  mod_id: 'flood-driver',
  profile_display_name: 'Flood Driver (profile)',
  resource_id: 11,
  resource_public_id: '11111111-1111-4111-8111-111111111111',
  resource_title: 'Flood Driver',
  version_id: 22,
  version_public_id: '22222222-2222-4222-8222-222222222222',
  version_label: '1.2.0',
  meta_display_name: 'Flood Driver',
  meta_version: '1.2.0',
  file_id: 33,
  file_public_id: '33333333-3333-4333-8333-333333333333',
  file_hash: HASH_A,
  file_size_bytes: 2048,
  delivery_mode: 'managed',
  ...overrides,
});

/** 只读目录解析不碰仓库；用 dataSource.query 的两条 SQL 区分别名解析与目录读取。 */
function buildService(options: {
  canonical?: Array<{ mod_id: string; requested_identifier: string }>;
  rows?: Array<Record<string, unknown>>;
} = {}) {
  const service = Object.create(MultiplayerModCatalogService.prototype) as any;
  service.dataSource = {
    query: jest.fn(async (sql: string) => {
      if (String(sql).includes('mod_id_aliases')) return options.canonical ?? [];
      if (String(sql).includes('resource_files file')) return options.rows ?? [];
      return [];
    }),
  };
  return service;
}

describe('MultiplayerModCatalogService resolution', () => {
  it('marks a public mod with a matching published SHA-256 as catalog_verified', async () => {
    const service = buildService({
      canonical: [{ mod_id: 'flood-driver', requested_identifier: 'flood-driver' }],
      rows: [catalogRow()],
    });

    const resolved = await service.resolveForCreate({ mods: [{ mod_id: 'flood-driver', sha256: HASH_A }] });

    expect(resolved.mods).toHaveLength(1);
    expect(resolved.mods[0]).toMatchObject({
      mod_id: 'flood-driver', display_name: 'Flood Driver', version: '1.2.0', sha256: HASH_A,
      resolution_status: 'catalog_verified', resource_id: 11, resource_version_id: 22,
      file_public_id: '33333333-3333-4333-8333-333333333333', file_size_bytes: 2048,
    });
    expect(service.toView(resolved.mods[0]).unresolved_reason).toBeNull();
  });

  it('records a hash mismatch without keeping a downloadable file reference', async () => {
    const service = buildService({
      canonical: [{ mod_id: 'flood-driver', requested_identifier: 'flood-driver' }],
      rows: [catalogRow({ file_hash: HASH_B })],
    });

    const resolved = await service.resolveForCreate({ mods: [{ mod_id: 'flood-driver', sha256: HASH_A }] });
    const view = service.toView(resolved.mods[0]);

    expect(resolved.mods[0]).toMatchObject({
      resolution_status: 'catalog_version_mismatch',
      resource_public_id: '11111111-1111-4111-8111-111111111111',
      file_public_id: null,
    });
    expect(view.unresolved_reason).toBe('catalog_version_mismatch');
  });

  it('keeps a catalog hit without a host hash as unlisted_local with a sha256_missing reason', async () => {
    const service = buildService({
      canonical: [{ mod_id: 'flood-driver', requested_identifier: 'flood-driver' }],
      rows: [catalogRow()],
    });

    const resolved = await service.resolveForCreate({ mods: [{ mod_id: 'flood-driver' }] });
    const view = service.toView(resolved.mods[0]);

    expect(resolved.mods[0]).toMatchObject({
      resolution_status: 'unlisted_local', sha256: null,
      file_public_id: '33333333-3333-4333-8333-333333333333',
    });
    expect(view.unresolved_reason).toBe('sha256_missing');
  });

  it('never exposes resource identity for a mod absent from the public catalog', async () => {
    const service = buildService({ canonical: [], rows: [] });

    const resolved = await service.resolveForCreate({ mods: [{ mod_id: 'private-mod', sha256: HASH_A }] });
    const view = service.toView(resolved.mods[0]);

    expect(resolved.mods[0]).toMatchObject({
      resolution_status: 'unlisted_local', resource_id: null, resource_public_id: null,
      resource_version_id: null, resource_version_public_id: null, file_public_id: null,
    });
    expect(view.unresolved_reason).toBe('not_in_catalog');
  });

  it('rejects two spellings that resolve to the same canonical mod', async () => {
    const service = buildService({
      canonical: [
        { mod_id: 'flood-driver', requested_identifier: 'flood-driver' },
        { mod_id: 'flood-driver', requested_identifier: 'flood-driver-legacy' },
      ],
      rows: [catalogRow()],
    });

    await expect(service.resolveForCreate({ mods: [
      { mod_id: 'flood-driver', sha256: HASH_A },
      { mod_id: 'flood-driver-legacy', sha256: HASH_A },
    ] })).rejects.toMatchObject({ status: 400, code: 'SESSION_MODS_INVALID' });
  });

  it('looks up internal file ids for download grants by public id', async () => {
    const service = buildService();
    service.files = {
      find: jest.fn().mockResolvedValue([{ id: 33, public_id: '33333333-3333-4333-8333-333333333333', delivery_mode: 'managed' }]),
    };

    const info = await service.fileGrantInfo(['33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333']);
    expect(info.get('33333333-3333-4333-8333-333333333333')).toEqual({ fileId: 33, deliveryMode: 'managed' });
    expect(service.files.find).toHaveBeenCalledTimes(1);
  });
});
