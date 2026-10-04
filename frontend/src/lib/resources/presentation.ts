import type { Resource } from '@/types';
import { resourceKindLabel } from '@/lib/display-labels';

export function resourceFilename(resource: Pick<Resource, 'file_name' | 'versions'>): string | null {
  return resource.versions?.[0]?.file_name || resource.file_name || null;
}

export function resourceFileExtension(filename?: string | null): string | null {
  if (!filename) return null;
  const base = filename.split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot).toLowerCase() : null;
}

export function resourceFileSummary(resource: Resource): string[] {
  const kind = resource.resource_kind || 'other';
  const kindLabels: Record<string, string> = {
    map: 'Mindustry 地图', schematic: 'Mindustry 蓝图', mod: 'Mod',
    game_version: 'Mindustry 游戏版本', server_plugin: '服务器插件',
    development_tool: '开发工具', texture_ui: '材质与界面资源', save: 'Mindustry 存档',
  };
  const filename = resourceFilename(resource);
  const extension = resourceFileExtension(filename);
  const fileSize = resource.versions?.[0]?.file_size || resource.file_size;
  return [kindLabels[kind] || resourceKindLabel(kind), extension, fileSize ? formatResourceSize(fileSize) : null].filter((value): value is string => Boolean(value));
}

export function resourceVersionLabel(resource: Pick<Resource, 'version' | 'versions'>): string | null {
  const version = resource.versions?.[0]?.version || resource.version;
  if (!version?.trim()) return null;
  return /^v/i.test(version) ? version : `v${version}`;
}

export function resourceCardFacts(resource: Resource): Array<{ label: string; value: string }> {
  const metadata = (resource.renderer_metadata || {}) as Record<string, unknown>;
  const facts: Array<{ label: string; value: string }> = [];
  const dimensions = typeof metadata.width === 'number' && typeof metadata.height === 'number' ? `${metadata.width} × ${metadata.height}` : null;
  if (resource.resource_kind === 'map') {
    if (dimensions) facts.push({ label: '地图尺寸', value: dimensions });
    const modes = Array.isArray(metadata.game_modes) ? metadata.game_modes.filter((item): item is string => typeof item === 'string') : [];
    if (modes.length) facts.push({ label: '模式', value: modes.slice(0, 2).join('、') });
    if (typeof metadata.planet === 'string' && metadata.planet) facts.push({ label: '星球', value: metadata.planet });
    if (typeof metadata.spawns === 'number') facts.push({ label: '出生点', value: String(metadata.spawns) });
    else if (typeof metadata.core_count === 'number') facts.push({ label: '核心', value: `${metadata.core_count} 个` });
  } else if (resource.resource_kind === 'schematic') {
    if (dimensions) facts.push({ label: '蓝图尺寸', value: dimensions });
    const blocks = typeof metadata.block_count === 'number' ? metadata.block_count : metadata.blocks;
    if (typeof blocks === 'number') facts.push({ label: '方块', value: blocks.toLocaleString() });
    if (typeof metadata.net_power === 'number') facts.push({ label: '净功率', value: `${metadata.net_power.toLocaleString()} / 秒` });
    if (typeof metadata.planet === 'string' && metadata.planet) facts.push({ label: '星球', value: metadata.planet });
  } else if (resource.resource_kind === 'mod') {
    const modVersion = typeof metadata.version === 'string' ? metadata.version : resourceVersionLabel(resource);
    if (modVersion) facts.push({ label: 'Mod 版本', value: /^v/i.test(modVersion) ? modVersion : `v${modVersion}` });
    const versions = resource.metadata?.supported_versions || [];
    if (versions.length) facts.push({ label: '支持游戏版本', value: versions.slice(0, 2).join('、') });
    const platforms = resource.metadata?.compatibility || [];
    if (platforms.length) facts.push({ label: '平台', value: platforms.slice(0, 2).join('、') });
  } else if (resource.resource_kind === 'game_version') {
    const build = typeof metadata.build === 'number' ? `构建号 ${metadata.build}` : typeof metadata.version === 'string' ? metadata.version : null;
    if (build) facts.push({ label: '游戏版本', value: build });
    if (typeof metadata.channel === 'string' && metadata.channel) facts.push({ label: '渠道', value: metadata.channel });
    const platforms = resource.metadata?.compatibility || [];
    if (platforms.length) facts.push({ label: '平台', value: platforms.slice(0, 2).join('、') });
  } else if (resource.resource_kind === 'server_plugin' || resource.resource_kind === 'development_tool' || resource.resource_kind === 'texture_ui' || resource.resource_kind === 'save') {
    const version = resourceVersionLabel(resource);
    if (version) facts.push({ label: '资源版本', value: version });
    const compatible = resource.metadata?.supported_versions || [];
    if (compatible.length) facts.push({ label: '适用版本', value: compatible.slice(0, 2).join('、') });
  } else {
    const version = resourceVersionLabel(resource);
    if (version) facts.push({ label: '资源版本', value: version });
  }
  return facts;
}

export function formatResourceSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function resourceStatusLabel(status?: string | null): string {
  if (status === 'approved' || status === 'published') return '已公开';
  if (status === 'pending' || status === 'pending_review') return '审核中';
  if (status === 'rejected') return '未通过审核';
  if (status === 'archived') return '已归档';
  return '资源';
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
