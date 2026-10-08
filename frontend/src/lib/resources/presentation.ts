import type { Resource } from '@/types';
import { resourceKindLabelKey } from '@/lib/display-labels';

export function resourceFilename(resource: Pick<Resource, 'file_name' | 'versions'>): string | null {
  return resource.versions?.[0]?.file_name || resource.file_name || null;
}

export function resourceFileExtension(filename?: string | null): string | null {
  if (!filename) return null;
  const base = filename.split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot).toLowerCase() : null;
}

/**
 * Compact file summary. Each entry is either a locale key or a literal that
 * needs no translation (extension, formatted size), so callers run the result
 * through `translate` — that is what keeps this locale-agnostic.
 */
export function resourceFileSummary(resource: Resource): string[] {
  const kind = resource.resource_kind || 'other';
  const filename = resourceFilename(resource);
  const extension = resourceFileExtension(filename);
  const fileSize = resource.versions?.[0]?.file_size || resource.file_size;
  return [resourceKindLabelKey(kind), extension, fileSize ? formatResourceSize(fileSize) : null].filter((value): value is string => Boolean(value));
}

export function resourceVersionLabel(resource: Pick<Resource, 'version' | 'versions'>): string | null {
  const version = resource.versions?.[0]?.version || resource.version;
  if (!version?.trim()) return null;
  return /^v/i.test(version) ? version : `v${version}`;
}

/**
 * Card facts. `label` is a locale key (`editor.*`), not display copy: the card
 * used to embed Chinese labels here, which leaked onto the English site.
 */
export function resourceCardFacts(resource: Resource): Array<{ label: string; value: string }> {
  const metadata = (resource.renderer_metadata || {}) as Record<string, unknown>;
  const facts: Array<{ label: string; value: string }> = [];
  const dimensions = typeof metadata.width === 'number' && typeof metadata.height === 'number' ? `${metadata.width} × ${metadata.height}` : null;
  if (resource.resource_kind === 'map') {
    if (dimensions) facts.push({ label: 'editor.mapSizeLabel', value: dimensions });
    const modes = Array.isArray(metadata.game_modes) ? metadata.game_modes.filter((item): item is string => typeof item === 'string') : [];
    if (modes.length) facts.push({ label: 'editor.modeLabel', value: modes.slice(0, 2).join('、') });
    if (typeof metadata.planet === 'string' && metadata.planet) facts.push({ label: 'editor.planetLabel', value: metadata.planet });
    if (typeof metadata.spawns === 'number') facts.push({ label: 'editor.spawnsLabel', value: String(metadata.spawns) });
    else if (typeof metadata.core_count === 'number') facts.push({ label: 'editor.coresUnit', value: String(metadata.core_count) });
  } else if (resource.resource_kind === 'schematic') {
    if (dimensions) facts.push({ label: 'editor.schematicSizeLabel', value: dimensions });
    const blocks = typeof metadata.block_count === 'number' ? metadata.block_count : metadata.blocks;
    if (typeof blocks === 'number') facts.push({ label: 'editor.blocksLabel', value: blocks.toLocaleString() });
    if (typeof metadata.net_power === 'number') facts.push({ label: 'editor.netPowerUnit', value: metadata.net_power.toLocaleString() });
    if (typeof metadata.planet === 'string' && metadata.planet) facts.push({ label: 'editor.planetLabel', value: metadata.planet });
  } else if (resource.resource_kind === 'mod') {
    const modVersion = typeof metadata.version === 'string' ? metadata.version : resourceVersionLabel(resource);
    if (modVersion) facts.push({ label: 'editor.modVersionLabel', value: /^v/i.test(modVersion) ? modVersion : `v${modVersion}` });
    const versions = resource.metadata?.supported_versions || [];
    if (versions.length) facts.push({ label: 'editor.supportedVersionsLabel', value: versions.slice(0, 2).join('、') });
    const platforms = resource.metadata?.compatibility || [];
    if (platforms.length) facts.push({ label: 'editor.platformLabel', value: platforms.slice(0, 2).join('、') });
  } else if (resource.resource_kind === 'game_version') {
    const build = typeof metadata.build === 'number' ? `${metadata.build}` : typeof metadata.version === 'string' ? metadata.version : null;
    if (build) facts.push({ label: 'editor.gameVersionLabel', value: typeof metadata.build === 'number' ? build : build });
    if (typeof metadata.channel === 'string' && metadata.channel) facts.push({ label: 'editor.channelLabel', value: metadata.channel });
    const platforms = resource.metadata?.compatibility || [];
    if (platforms.length) facts.push({ label: 'editor.platformLabel', value: platforms.slice(0, 2).join('、') });
  } else if (resource.resource_kind === 'server_plugin' || resource.resource_kind === 'development_tool' || resource.resource_kind === 'texture_ui' || resource.resource_kind === 'save') {
    const version = resourceVersionLabel(resource);
    if (version) facts.push({ label: 'editor.resourceVersionLabel', value: version });
    const compatible = resource.metadata?.supported_versions || [];
    if (compatible.length) facts.push({ label: 'editor.compatibleVersionsLabel', value: compatible.slice(0, 2).join('、') });
  } else {
    const version = resourceVersionLabel(resource);
    if (version) facts.push({ label: 'editor.resourceVersionLabel', value: version });
  }
  return facts;
}

export function formatResourceSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Status key for the shared catalog; callers translate it. */
export function resourceStatusLabel(status?: string | null): string {
  if (status === 'approved' || status === 'published') return 'editor.visibilityPublic';
  if (status === 'pending' || status === 'pending_review') return 'editor.statusPending';
  if (status === 'rejected') return 'resourceLabels.statusRejected';
  if (status === 'archived') return 'resourceLabels.statusArchived';
  return 'resourceLabels.kindFallback';
}

export type ResourceCardPresentation = 'gallery' | 'information' | 'generic';

/** Maps and schematics need a preview first; software and tools need readable facts. */
export function resolveResourceCardPresentation(kind?: string | null): ResourceCardPresentation {
  if (kind === 'map' || kind === 'schematic') return 'gallery';
  if (['mod', 'game_version', 'server_plugin', 'development_tool', 'texture_ui', 'save'].includes(kind || '')) {
    return 'information';
  }
  return 'generic';
}
