import { Injectable } from '@nestjs/common';

/**
 * Projects structured Resource aggregate data back into a Legacy-compatible view.
 *
 * Used for backward compatibility: when the V1 flag is off, the existing
 * controller still needs to serve data in the old shape. This service owns
 * the mapping rules so both paths share one source of truth.
 */

export type LegacyResourceProjection = {
  id: number;
  title: string;
  description: string;
  version: string;
  resource_type: string;
  download_count: number;
  file_name: string | null;
  file_size: number | null;
  external_url: string | null;
  use_mfl: number;
  mfl_download_url: string | null;
};

@Injectable()
export class ResourceLegacyProjectionService {
  /**
   * Given structured resource data, project it back into the legacy shape.
   *
   * This is used during the transition period where some fields come from
   * the new aggregate (e.g. summary → description) and others from legacy
   * columns that are still authoritative.
   */
  projectToLegacy(resource: Record<string, any>): LegacyResourceProjection {
    return {
      id: resource.id,
      title: resource.title,
      // If summary exists and description is empty, use summary as description
      description: resource.description || resource.summary || '',
      version: this.resolveDisplayVersion(resource),
      resource_type: resource.resource_type,
      download_count: resource.download_count || 0,
      file_name: resource.file_name || null,
      file_size: resource.file_size || null,
      external_url: resource.external_url || null,
      use_mfl: resource.use_mfl || 0,
      mfl_download_url: resource.mfl_download_url || null,
    };
  }

  /**
   * Resolve a human-readable version string.
   *
   * - If the resource has a non-blank version, use it
   * - If the version is `legacy-{id}`, show "版本未知"
   * - Otherwise show "版本未知"
   */
  private resolveDisplayVersion(resource: Record<string, any>): string {
    const version = (resource.version || '').trim();
    if (!version) return '版本未知';
    if (/^legacy-\d+$/.test(version)) return '版本未知';
    return version;
  }
}
