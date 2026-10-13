/**
 * V1 compatibility vocabulary, shared by every reader that speaks it.
 *
 * Legacy `resource_version_compatibilities.provenance` already uses this
 * vocabulary. Modern `resource_compatibilities.source` uses
 * `author` / `analyzer` / `community`; the Resource Center migration derived it
 * by collapsing `inferred|file_metadata` → `analyzer` and everything else →
 * `author`, so mapping `analyzer` back to `inferred` keeps analyzer evidence
 * visible as inferred instead of silently degrading to author-declared.
 *
 * One mapper for all readers: a second copy is how the two paths drift.
 */
export type V1CompatibilityProvenance = 'file_metadata' | 'inferred' | 'user_declared' | 'verified' | 'admin_verified';

export type V1CompatibilityConfidence = 'low' | 'medium' | 'high' | null;

export function normalizeCompatibilityProvenance(value: unknown): V1CompatibilityProvenance {
  switch (String(value)) {
    case 'file_metadata': return 'file_metadata';
    case 'inferred':
    case 'analyzer': return 'inferred';
    case 'verified': return 'verified';
    case 'admin_verified': return 'admin_verified';
    default: return 'user_declared';
  }
}

export function normalizeCompatibilityConfidence(value: unknown): V1CompatibilityConfidence {
  return ['low', 'medium', 'high'].includes(String(value)) ? value as V1CompatibilityConfidence : null;
}
