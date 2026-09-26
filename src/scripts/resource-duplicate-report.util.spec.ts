import { groupResourceFingerprints, ResourceFingerprintRow } from './resource-duplicate-report.util';

const row = (id: number, contentHash: string | null, resourceId = id): ResourceFingerprintRow => ({
  id,
  resource_id: resourceId,
  public_id: `public-${resourceId}`,
  title: `Resource ${resourceId}`,
  status: 'published',
  content_hash: contentHash,
  structure_hash: null,
  normalized_structure_hash: null,
});

describe('groupResourceFingerprints', () => {
  it('reports cross-resource file duplicates while collapsing a resource root and its version/file rows', () => {
    const groups = groupResourceFingerprints([
      row(1, 'a'.repeat(64)),
      row(2, 'a'.repeat(64), 1),
      row(3, 'a'.repeat(64), 1),
      row(4, 'a'.repeat(64)),
    ], 'content_hash');

    expect(groups).toEqual([{
      fingerprint: 'a'.repeat(64),
      resource_ids: [1, 4],
      public_ids: ['public-1', 'public-4'],
      titles: ['Resource 1', 'Resource 4'],
      statuses: ['published', 'published'],
    }]);
  });

  it('ignores single-owner hashes and sorts duplicate groups by size then fingerprint', () => {
    const groups = groupResourceFingerprints([
      row(1, 'b'.repeat(64)), row(2, 'b'.repeat(64)),
      row(3, 'c'.repeat(64)), row(4, 'c'.repeat(64)), row(5, 'c'.repeat(64)),
      row(6, 'd'.repeat(64)),
    ], 'content_hash');

    expect(groups.map(({ fingerprint, resource_ids }) => [fingerprint[0], resource_ids.length])).toEqual([['c', 3], ['b', 2]]);
  });
});
