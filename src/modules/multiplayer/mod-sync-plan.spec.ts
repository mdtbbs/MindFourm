import {
  buildModSyncPlan, deriveUnresolvedReason, normalizeInstalledMods, summarizeSessionMods,
  type InstalledModInput, type SessionModView,
} from './mod-sync-plan';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function hostMod(overrides: Partial<SessionModView> = {}): SessionModView {
  return {
    mod_id: 'flood-driver',
    display_name: 'Flood Driver',
    version: '1.2.0',
    sha256: HASH_A,
    required: true,
    resolution_status: 'catalog_verified',
    resource_public_id: 'resource-1',
    resource_version_public_id: 'version-1',
    file_public_id: 'file-1',
    file_size_bytes: 1024,
    unresolved_reason: null,
    ...overrides,
  };
}

function local(overrides: Partial<InstalledModInput> = {}): InstalledModInput {
  return { mod_id: 'flood-driver', version: '1.2.0', sha256: HASH_A, enabled: true, client_only: false, ...overrides };
}

describe('buildModSyncPlan', () => {
  it('downloads a missing catalog-verified mod', () => {
    const plan = buildModSyncPlan([hostMod()], []);
    expect(plan.status).toBe('sync_required');
    expect(plan.to_download).toEqual([{
      mod_id: 'flood-driver', display_name: 'Flood Driver', version: '1.2.0', sha256: HASH_A,
      size_bytes: 1024, resource_public_id: 'resource-1', resource_version_public_id: 'version-1',
      file_public_id: 'file-1', reason: 'missing',
    }]);
    expect(plan.to_enable).toEqual([]);
    expect(plan.unresolved).toEqual([]);
  });

  it('downloads again when the local hash differs from the host manifest', () => {
    const plan = buildModSyncPlan([hostMod()], [local({ sha256: HASH_B })]);
    expect(plan.to_download).toHaveLength(1);
    expect(plan.to_download[0].reason).toBe('hash_mismatch');
  });

  it('treats a local mod without a hash as unverified rather than synced', () => {
    const plan = buildModSyncPlan([hostMod()], [local({ sha256: undefined })]);
    expect(plan.to_download[0].reason).toBe('unverified');
  });

  it('enables a matching but disabled local mod without downloading it', () => {
    const plan = buildModSyncPlan([hostMod()], [local({ enabled: false })]);
    expect(plan.status).toBe('sync_required');
    expect(plan.to_download).toEqual([]);
    expect(plan.to_enable).toEqual([{
      mod_id: 'flood-driver', display_name: 'Flood Driver', version: '1.2.0', sha256: HASH_A,
      size_bytes: 1024, resource_public_id: 'resource-1', resource_version_public_id: 'version-1',
      file_public_id: 'file-1',
    }]);
  });

  it('is ready when every host mod matches and no extra content mod is enabled', () => {
    const plan = buildModSyncPlan([hostMod()], [local(), local({ mod_id: 'lanlink', sha256: HASH_B })]);
    expect(plan.status).toBe('ready');
    expect(plan.preserved_client_mods.map((mod) => mod.mod_id)).toEqual(['lanlink']);
  });

  it('disables enabled content mods that the host does not list', () => {
    const plan = buildModSyncPlan([hostMod()], [local(), local({ mod_id: 'extra-content', sha256: HASH_B })]);
    expect(plan.status).toBe('sync_required');
    expect(plan.to_disable).toEqual([{
      mod_id: 'extra-content', display_name: null, version: '1.2.0', sha256: HASH_B,
    }]);
  });

  it('preserves client-only helper mods instead of disabling them', () => {
    const plan = buildModSyncPlan([hostMod()], [
      local(),
      local({ mod_id: 'mdtbbsaddon', sha256: HASH_B }),
      local({ mod_id: 'font-pack', sha256: HASH_B, client_only: true }),
    ]);
    expect(plan.to_disable).toEqual([]);
    expect(plan.preserved_client_mods.map((mod) => mod.mod_id)).toEqual(['font-pack', 'mdtbbsaddon']);
    expect(plan.status).toBe('ready');
  });

  it('never disables a client-only mod the host itself lists', () => {
    const plan = buildModSyncPlan([hostMod({ mod_id: 'lanlink', sha256: HASH_B })], [local({ mod_id: 'lanlink', sha256: HASH_B })]);
    expect(plan.to_disable).toEqual([]);
    expect(plan.preserved_client_mods).toEqual([]);
    expect(plan.status).toBe('ready');
  });

  it('keeps unresolved entries and still allows downloading the verified subset', () => {
    const plan = buildModSyncPlan([
      hostMod(),
      hostMod({
        mod_id: 'private-mod', sha256: HASH_B, resolution_status: 'unlisted_local',
        resource_public_id: null, resource_version_public_id: null, file_public_id: null,
        unresolved_reason: 'not_in_catalog',
      }),
      hostMod({
        mod_id: 'old-build', sha256: HASH_B, resolution_status: 'catalog_version_mismatch',
        file_public_id: null, unresolved_reason: 'catalog_version_mismatch',
      }),
    ], []);
    expect(plan.status).toBe('partial_sync_required');
    expect(plan.to_download.map((item) => item.mod_id)).toEqual(['flood-driver']);
    expect(plan.unresolved.map((item) => [item.mod_id, item.reason])).toEqual([
      ['old-build', 'catalog_version_mismatch'],
      ['private-mod', 'not_in_catalog'],
    ]);
  });

  it('rejects duplicate installed ids through the normalizer', () => {
    const { mods, duplicates } = normalizeInstalledMods([
      { mod_id: 'Flood-Driver' }, { mod_id: 'flood-driver' }, { mod_id: '  ' },
    ]);
    expect(mods.map((mod) => mod.mod_id)).toEqual(['Flood-Driver']);
    expect(duplicates).toEqual(['flood-driver']);
  });
});

describe('deriveUnresolvedReason', () => {
  it('maps persisted fields to a stable reason without an extra column', () => {
    expect(deriveUnresolvedReason({ resolution_status: 'catalog_verified', resource_id: 1, file_public_id: 'f', sha256: HASH_A })).toBeNull();
    expect(deriveUnresolvedReason({ resolution_status: 'catalog_version_mismatch' })).toBe('catalog_version_mismatch');
    expect(deriveUnresolvedReason({ resolution_status: 'unlisted_local' })).toBe('not_in_catalog');
    expect(deriveUnresolvedReason({ resolution_status: 'unlisted_local', resource_id: 1 })).toBe('catalog_file_unavailable');
    expect(deriveUnresolvedReason({ resolution_status: 'unlisted_local', resource_id: 1, file_public_id: 'f' })).toBe('sha256_missing');
  });
});

describe('summarizeSessionMods', () => {
  it('reports counts, syncable badges and list truncation', () => {
    const mods = Array.from({ length: 10 }, (_, index) => hostMod({
      mod_id: `mod-${index}`,
      resolution_status: index === 0 ? 'unlisted_local' : 'catalog_verified',
      unresolved_reason: index === 0 ? 'not_in_catalog' : null,
      sha256: index === 0 ? null : HASH_A,
    }));
    const summary = summarizeSessionMods(mods, { public_id: 'pack-1', version_public_id: 'pack-v1', title: 'Pack' }, 8);

    expect(summary.modded).toBe(true);
    expect(summary.mod_count).toBe(10);
    expect(summary.syncable_count).toBe(9);
    expect(summary.mods).toHaveLength(8);
    expect(summary.mods_truncated).toBe(true);
    expect(summary.pack).toEqual({ public_id: 'pack-1', version_public_id: 'pack-v1', title: 'Pack' });
    expect(summary.mods[0]).toEqual({
      mod_id: 'mod-0', display_name: 'Flood Driver', version: '1.2.0', syncable: false, resolution_status: 'unlisted_local',
    });
  });

  it('represents a vanilla room with an empty summary', () => {
    expect(summarizeSessionMods([], null, null)).toEqual({
      modded: false, mod_count: 0, syncable_count: 0, pack: null, mods: [], mods_truncated: false,
    });
  });
});
