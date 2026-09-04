/**
 * Type definitions for the Resource aggregate service.
 *
 * These types describe the structured view of a Resource that spans multiple
 * tables (resources, resource_versions, resource_files, resource_attributions).
 * No public controller consumes these yet — they are internal infrastructure.
 */

export type ResourceVersionStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

export type FileIntegrityStatus =
  | 'verified'
  | 'unverified_legacy'
  | 'failed'
  | 'unavailable';

export type FileDeliveryMode = 'managed' | 'mfl' | 'external';

export type FileAvailabilityStatus = 'available' | 'unavailable' | 'pending';

/**
 * Valid combinations of delivery_mode and integrity_status.
 *
 * New managed installable files require verified SHA-256 before becoming
 * client-installable. Legacy files with no recoverable hash remain
 * Web-downloadable but are marked unverified_legacy.
 */
export const VALID_DELIVERY_INTEGRITY_COMBOS: ReadonlyArray<{
  delivery_mode: FileDeliveryMode;
  integrity_status: FileIntegrityStatus;
}> = [
  { delivery_mode: 'managed', integrity_status: 'verified' },
  { delivery_mode: 'managed', integrity_status: 'unverified_legacy' },
  { delivery_mode: 'managed', integrity_status: 'failed' },
  { delivery_mode: 'managed', integrity_status: 'unavailable' },
  { delivery_mode: 'mfl', integrity_status: 'unverified_legacy' },
  { delivery_mode: 'mfl', integrity_status: 'verified' },
  { delivery_mode: 'mfl', integrity_status: 'unavailable' },
  { delivery_mode: 'external', integrity_status: 'unverified_legacy' },
  { delivery_mode: 'external', integrity_status: 'unavailable' },
];

/**
 * Check whether a delivery_mode + integrity_status combination is valid.
 */
export function isValidDeliveryIntegrityCombo(
  deliveryMode: string,
  integrityStatus: string,
): boolean {
  return VALID_DELIVERY_INTEGRITY_COMBOS.some(
    (combo) => combo.delivery_mode === deliveryMode && combo.integrity_status === integrityStatus,
  );
}

/**
 * Compute whether a file is downloadable, verifiable, and installable
 * based on its integrity and availability state.
 *
 * These are policy-derived capabilities, not independently mutable columns.
 */
export function computeFileCapabilities(
  integrityStatus: FileIntegrityStatus,
  availabilityStatus: FileAvailabilityStatus,
  deliveryMode: FileDeliveryMode,
): {
  downloadable: boolean;
  verifiable: boolean;
  installable: boolean;
  install_block_reason: string | null;
} {
  const downloadable = availabilityStatus === 'available';
  const verifiable = integrityStatus === 'verified';
  const installable = verifiable && downloadable && deliveryMode === 'managed';

  let install_block_reason: string | null = null;
  if (!installable) {
    if (availabilityStatus !== 'available') {
      install_block_reason = 'file_unavailable';
    } else if (integrityStatus === 'unverified_legacy') {
      install_block_reason = 'hash_unverified';
    } else if (integrityStatus === 'failed') {
      install_block_reason = 'hash_failed';
    } else if (deliveryMode !== 'managed') {
      install_block_reason = 'not_managed';
    } else {
      install_block_reason = 'unknown';
    }
  }

  return { downloadable, verifiable, installable, install_block_reason };
}
