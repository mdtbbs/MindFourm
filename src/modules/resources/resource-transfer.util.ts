import { BadRequestException } from '@nestjs/common';
import type { SiteConfiguration, SiteProfile } from '@config/site-profile';
import { isSafeExternalUrl } from '@common/utils/safe-url.util';

export const RESOURCE_TRANSFER_FORMAT = 'mindustry-resource/v1';
const KNOWN_SITE_PROFILES = new Set<SiteProfile>(['mdtbbs', 'mindustry-club']);
const SITE_DOMAINS: Readonly<Record<SiteProfile, string>> = {
  mdtbbs: 'mdtbbs.cn',
  'mindustry-club': 'mindustry.club',
};

export interface ResourceImportManifest {
  format: typeof RESOURCE_TRANSFER_FORMAT;
  origin: { site: SiteProfile; resource_id: string; url: string };
  resource: Record<string, unknown>;
}

export function buildResourceExportManifest(
  resource: Record<string, any>,
  site: SiteConfiguration,
): ResourceImportManifest {
  // These admin transfer routes resolve the existing numeric API/page IDs; the
  // V1 public_id remains metadata and is not accepted by the legacy download route.
  const resourceId = String(resource.id);
  const originUrl = `https://${site.domain}/resources/${encodeURIComponent(resourceId)}`;
  const resourceFields: Record<string, unknown> = {
    title: resource.title,
    description: resource.description || undefined,
    resource_type: resource.resource_type === 'file' ? 'upload' : resource.resource_type,
    resource_kind: resource.resource_kind || 'other',
    external_url: resource.external_url || undefined,
    version: resource.version || resource.versions?.[0]?.version || '1.0.0',
    content: resource.content || undefined,
    content_json: resource.content_json || undefined,
    content_language: resource.content_language || 'unknown',
    is_public: Number(resource.is_public) === 1 || resource.is_public === true ? 1 : 0,
    metadata: resource.metadata || resource.metadata_json || undefined,
    source_url: resource.source_url || undefined,
    license: resource.license || undefined,
    original_authors: resource.original_authors || undefined,
    maintainers: resource.maintainers || undefined,
    compatibility: resource.versions?.[0]?.compatibility || undefined,
    file_name: resource.file_name || undefined,
    file_download_url: resource.resource_type === 'upload'
      ? `https://${site.domain}/api/resources/${encodeURIComponent(resourceId)}/download`
      : undefined,
  };

  return {
    format: RESOURCE_TRANSFER_FORMAT,
    origin: { site: site.profile, resource_id: resourceId, url: originUrl },
    resource: Object.fromEntries(Object.entries(resourceFields).filter(([, value]) => value !== undefined)),
  };
}

export function parseResourceImportManifest(value: unknown, targetSite: SiteProfile): ResourceImportManifest {
  let manifest = value as any;
  if (typeof value === 'string') {
    try { manifest = JSON.parse(value); } catch { throw new BadRequestException('Manifest must be valid JSON'); }
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.format !== RESOURCE_TRANSFER_FORMAT) {
    throw new BadRequestException(`Manifest format must be ${RESOURCE_TRANSFER_FORMAT}`);
  }

  const origin = manifest.origin;
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)
    || !KNOWN_SITE_PROFILES.has(origin.site)
    || origin.site === targetSite
    || typeof origin.resource_id !== 'string'
    || !origin.resource_id.trim()
    || origin.resource_id.length > 128
    || typeof origin.url !== 'string'
    || origin.url.length > 500
    || !isSafeExternalUrl(origin.url)) {
    throw new BadRequestException('Manifest origin must identify a resource on the other community site');
  }
  const sourceUrl = new URL(origin.url.trim());
  if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname.toLowerCase() !== SITE_DOMAINS[origin.site]) {
    throw new BadRequestException('Manifest origin URL does not match its declared community site');
  }

  const resource = manifest.resource;
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    throw new BadRequestException('Manifest resource is required');
  }

  return {
    format: RESOURCE_TRANSFER_FORMAT,
    origin: { site: origin.site, resource_id: origin.resource_id.trim(), url: origin.url.trim() },
    resource,
  };
}
