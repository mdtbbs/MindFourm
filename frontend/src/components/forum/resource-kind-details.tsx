import { useEffect, useState } from 'react';
import { Blocks, Package } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import { resourceCardFacts, resourceFileSummary } from '@/lib/resources/presentation';
import { useI18n } from '@/i18n/provider';
import PackManifestPanel from './resources/detail/pack-manifest-panel';
import { normalizeMapWaves, summarizeMapTileResources } from '@/lib/resources/map-analysis';

type ContentEntry = { name: string; icon: string | null };
type ProductionEntry = { id: string; name?: string; rate?: number; produced?: number; consumed?: number; net?: number; estimated?: boolean };
type ProductionFlow = { inputs?: ProductionEntry[]; outputs?: ProductionEntry[]; internal?: ProductionEntry[] };

function formatRate(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(Number.isFinite(value) ? value : 0);
}

function RateList({ title, entries, catalog, locale, estimatedLabel }: { title: string; entries: ProductionEntry[]; catalog: Record<string, ContentEntry>; locale: string; estimatedLabel: string }) {
  if (!entries.length) return null;
  return <div className="min-w-0">
    <h4 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{title}</h4>
    <ul className="space-y-1.5">{entries.map((entry) => {
      const content = catalog[entry.id];
      return <li key={entry.id} className="flex min-w-0 items-center gap-2 text-sm" title={entry.estimated ? estimatedLabel : undefined}>
        <ContentIcon entry={content} kind="item" />
        <span className="min-w-0 flex-1 truncate text-[var(--text)]">{content?.name || entry.name || entry.id}{entry.estimated && <span className="ml-1 text-xs text-[var(--text-muted)]">{estimatedLabel}</span>}</span>
        <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">{formatRate(entry.rate || 0, locale)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span>
      </li>;
    })}</ul>
  </div>;
}

function ContentIcon({ entry, kind }: { entry?: ContentEntry; kind: 'item' | 'block' }) {
  const FallbackIcon = kind === 'item' ? Package : Blocks;
  return <span className="relative flex h-7 w-7 shrink-0 items-center justify-center text-[var(--text-muted)]" title={entry?.name}>
    <FallbackIcon aria-hidden="true" className="h-4 w-4" />
    {entry?.icon && <img src={entry.icon} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
  </span>;
}

const factKeys: Record<string, string> = {
  '地图尺寸': 'mapSize', '模式': 'mode', '星球': 'planet', '出生点': 'spawns', '核心': 'cores',
  '蓝图尺寸': 'schematicSize', '方块': 'blocks', '净功率': 'netPower', 'Mod 版本': 'modVersion',
  '支持游戏版本': 'supportedGameVersions', '平台': 'platform', '游戏版本': 'gameVersion', '渠道': 'channel',
  '资源版本': 'resourceVersion', '适用版本': 'compatibleVersions',
};

function FactGrid({ resource, t }: { resource: Resource; t: (key: string) => string }) {
  const facts = resourceCardFacts(resource);
  if (!facts.length) return <p className="text-sm text-[var(--text-muted)]">{t('resourceKindDetails.noFacts')}</p>;
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">{facts.map((fact) => <div key={fact.label}><dt className="text-xs text-[var(--text-muted)]">{t(`resourceKindDetails.fact.${factKeys[fact.label] || 'resourceVersion'}`)}</dt><dd className="mt-1 break-words font-semibold text-[var(--text)]">{fact.value}</dd></div>)}</dl>;
}

export default function ResourceKindDetails({ resource, selectedVersionPublicId }: { resource: Resource; selectedVersionPublicId?: string }) {
  const { t, locale } = useI18n();
  const kind = resource.resource_kind || 'other';
  const metadata = (resource.renderer_metadata || {}) as Record<string, unknown>;
  const title = kind === 'map' ? t('resourceKindDetails.titleMap') : kind === 'schematic' ? t('resourceKindDetails.titleSchematic') : kind === 'mod' ? t('resourceKindDetails.titleMod') : kind === 'game_version' ? t('resourceKindDetails.titleGameVersion') : t('resourceKindDetails.titleResource');
  const dependencies = [
    ...(Array.isArray(metadata.required_mods) ? metadata.required_mods.filter((item): item is string => typeof item === 'string') : []),
    ...(Array.isArray(metadata.mod_dependencies) ? metadata.mod_dependencies.filter((item): item is string => typeof item === 'string') : []),
  ];
  const requirements = Array.isArray(metadata.requirements) ? metadata.requirements.filter((item): item is { item?: string; amount?: number } => Boolean(item && typeof item === 'object')) : [];
  const blockTypes = Array.isArray(metadata.block_types) ? metadata.block_types.filter((item): item is { name?: string; count?: number } => Boolean(item && typeof item === 'object')) : [];
  const estimatedBuildTimeSeconds = typeof metadata.estimated_build_time_seconds === 'number'
    && Number.isFinite(metadata.estimated_build_time_seconds) && metadata.estimated_build_time_seconds > 0
    ? Math.ceil(metadata.estimated_build_time_seconds)
    : null;
  const production = metadata.production && typeof metadata.production === 'object' ? metadata.production as Record<string, any> : null;
  const productionItems = (production?.items || {}) as ProductionFlow;
  const productionLiquids = (production?.liquids || {}) as ProductionFlow;
  const itemIds = [...new Set(requirements.map((item) => item.item).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const blockIds = [...new Set(blockTypes.map((item) => item.name).filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const productionItemIds = [...new Set(['inputs', 'outputs', 'internal'].flatMap((part) => productionItems[part as keyof ProductionFlow] || []).map((entry) => entry.id))];
  const productionLiquidIds = [...new Set(['inputs', 'outputs', 'internal'].flatMap((part) => productionLiquids[part as keyof ProductionFlow] || []).map((entry) => entry.id))];
  const productionWarningBlockIds = Array.isArray(production?.warnings) ? production.warnings.map((warning: { blockId?: unknown }) => warning.blockId).filter((id: unknown): id is string => typeof id === 'string') : [];
  const allItemIds = [...new Set([...itemIds, ...productionItemIds])];
  const allBlockIds = [...new Set([...blockIds, ...productionWarningBlockIds])];
  const [contentMetadata, setContentMetadata] = useState<{ items: Record<string, ContentEntry>; blocks: Record<string, ContentEntry>; liquids: Record<string, ContentEntry> }>({ items: {}, blocks: {}, liquids: {} });
  useEffect(() => {
    if (!allItemIds.length && !allBlockIds.length && !productionLiquidIds.length) { setContentMetadata({ items: {}, blocks: {}, liquids: {} }); return; }
    let active = true;
    resourceApi.getMindustryContentMetadata(allItemIds, allBlockIds, productionLiquidIds)
      .then((result) => { if (active) setContentMetadata(result); })
      .catch(() => { if (active) setContentMetadata({ items: {}, blocks: {}, liquids: {} }); });
    return () => { active = false; };
  // The IDs form a stable content identity for each schematic metadata payload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItemIds.join(','), allBlockIds.join(','), productionLiquidIds.join(',')]);
  const sortedRequirements = [...requirements].sort((left, right) => (right.amount || 0) - (left.amount || 0));
  const sortedBlockTypes = [...blockTypes].sort((left, right) => (right.count || 0) - (left.count || 0));
  const extendedMapData = ([
    [t('resourceKindDetails.teams'), Array.isArray(metadata.teams) ? metadata.teams.join('、') : ''],
    [t('resourceKindDetails.bannedUnits'), Array.isArray(metadata.banned_units) ? metadata.banned_units.join('、') : ''],
    [t('resourceKindDetails.bannedBlocks'), Array.isArray(metadata.banned_blocks) ? metadata.banned_blocks.join('、') : ''],
  ] as Array<[string, string]>).filter(([, value]) => value.length > 0);
  const mapWaves = kind === 'map' ? normalizeMapWaves(metadata.wave_groups) : [];
  const mapResources = kind === 'map' ? summarizeMapTileResources(metadata.tile_layers) : [];
  const mapBuild = metadata.map_build_metadata && typeof metadata.map_build_metadata === 'object'
    ? metadata.map_build_metadata as { stored_game_build?: unknown; save_format_version?: unknown }
    : null;
  const rendererCompatibility = metadata.compatibility && typeof metadata.compatibility === 'object'
    ? metadata.compatibility as { minimum_supported_build?: unknown; confidence?: unknown; unknown_content?: unknown }
    : null;
  const compatibilityEvidence = (resource.versions || []).flatMap((version) => (version.compatibility || [])
    .filter((item) => item.runtime === 'mindustry')
    .map((item) => ({ ...item, version: version.version })));
  const hasBuildEvidence = kind === 'map'
    ? typeof mapBuild?.stored_game_build === 'number'
    : typeof rendererCompatibility?.minimum_supported_build === 'number';
  const evidenceLabel = (provenance: string) => provenance === 'admin_verified' || provenance === 'verified'
    ? t('resourceKindDetails.communityVerified') : provenance === 'user_declared' ? t('resourceKindDetails.authorDeclared') : provenance === 'file_metadata' ? t('resourceKindDetails.fileMetadata') : t('resourceKindDetails.inferred');
  const evidenceValue = (item: (typeof compatibilityEvidence)[number]) => {
    const lower = item.min_version_value;
    const upper = item.max_version_value;
    if (lower && upper) return `${lower} ${t('resourceKindDetails.toVersion')} ${upper}`;
    if (lower) return `≥ ${lower}`;
    if (upper) return `≤ ${upper}`;
    return item.channel || t('resourceKindDetails.unrestricted');
  };

  if (kind === 'pack') return <PackManifestPanel resource={resource} selectedVersionPublicId={selectedVersionPublicId} />;
  if (!['map', 'schematic', 'mod', 'game_version', 'server_plugin', 'development_tool', 'texture_ui', 'save'].includes(kind)) return null;
  const mediumLabel = t('resourceKindDetails.confidenceMedium');
  const lowLabel = t('resourceKindDetails.confidenceLow');
  const confidenceLabel = (value: unknown) => value === 'high' ? t('resourceKindDetails.confidenceHigh') : value === 'medium' ? mediumLabel : lowLabel;
  return <section className="border-b border-[var(--border)] py-6">
    <h2 className="mb-5 text-lg font-semibold text-[var(--text)]">{title}</h2>
    <FactGrid resource={resource} t={t} />
    {(kind === 'map' || kind === 'schematic') && (hasBuildEvidence || compatibilityEvidence.length > 0) && <section className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text)]">{t('resourceKindDetails.buildCompatibility')}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        {kind === 'map' && typeof mapBuild?.stored_game_build === 'number' && <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-[var(--text-muted)]">{t('resourceKindDetails.fileRecord')}</dt><dd className="text-[var(--text)]">构建号 {mapBuild.stored_game_build}</dd></div>}
        {kind === 'schematic' && typeof rendererCompatibility?.minimum_supported_build === 'number' && <div className="flex flex-wrap justify-between gap-x-4"><dt className="text-[var(--text-muted)]">{t('resourceKindDetails.contentInference', { confidence: confidenceLabel(rendererCompatibility.confidence) })}</dt><dd className="text-[var(--text)]">{t('resourceKindDetails.minimumBuild', { build: rendererCompatibility.minimum_supported_build })}</dd></div>}
        {compatibilityEvidence.filter((item) => item.provenance !== 'inferred' || !hasBuildEvidence).map((item, index) => <div key={`${item.version}-${item.provenance}-${index}`} className="flex flex-wrap justify-between gap-x-4"><dt className="text-[var(--text-muted)]">{evidenceLabel(item.provenance)} · {t('resourceTabs.versionLabel', { version: item.version || '' })}</dt><dd className="text-[var(--text)]">{evidenceValue(item)}{item.confidence ? ` · ${confidenceLabel(item.confidence)} ${t('resourceKindDetails.confidenceSuffix')}` : ''}</dd></div>)}
      </dl>
      {kind === 'schematic' && Array.isArray(rendererCompatibility?.unknown_content) && rendererCompatibility.unknown_content.length > 0 && <p className="mt-3 text-xs text-[var(--text-muted)]">{t('resourceKindDetails.unknownContent')}</p>}
    </section>}
    {kind === 'map' && <>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        {resource.metadata?.planets?.length ? <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">{t('resourceKindDetails.planets')}</dt><dd className="text-right text-[var(--text)]">{resource.metadata.planets.join('、')}</dd></div> : null}
        {typeof metadata.waves === 'boolean' && <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">{t('resourceKindDetails.waves')}</dt><dd className="text-[var(--text)]">{metadata.waves ? t('resourceKindDetails.enabled') : t('resourceKindDetails.disabled')}</dd></div>}
        {typeof metadata.core_count === 'number' && <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">{t('resourceKindDetails.cores')}</dt><dd className="text-[var(--text)]">{t('resourceKindDetails.count', { count: new Intl.NumberFormat(locale).format(metadata.core_count) })}{Array.isArray(metadata.core_teams) && metadata.core_teams.length ? ` · ${metadata.core_teams.join('、')}` : ''}</dd></div>}
      </dl>
      {(mapResources.length > 0 || mapWaves.length > 0) && <div className="mt-5 grid gap-5 border-t border-[var(--border)] pt-5 lg:grid-cols-2">
        {mapResources.length > 0 && <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-base font-semibold text-[var(--text)]">{t('resourceKindDetails.mapResources')}</h3><span className="text-xs text-[var(--text-muted)]">{t('resourceKindDetails.mapResourcesNote')}</span></div>
          <ul className="space-y-1.5">{mapResources.map((item) => {
            const content = contentMetadata.items[item.internal_name] || contentMetadata.blocks[item.internal_name];
            const resourceTypeLabel = item.resource_type === 'liquid'
              ? t('resourceKindDetails.resourceTypeLiquid')
              : item.resource_type === 'ore' ? t('resourceKindDetails.resourceTypeOre') : t('resourceKindDetails.resourceTypeItem');
            return <li key={`${item.resource_type}-${item.internal_name}`} className="flex min-w-0 items-center gap-2 text-sm">
              <ContentIcon entry={content} kind="item" />
              <span className="min-w-0 flex-1 truncate text-[var(--text)]">{content?.name || item.internal_name}</span>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">{resourceTypeLabel}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">{t('resourceKindDetails.mapTileCount', { count: new Intl.NumberFormat(locale).format(item.tiles) })}</span>
            </li>;
          })}</ul>
        </section>}
        {mapWaves.length > 0 && <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-base font-semibold text-[var(--text)]">{t('resourceKindDetails.mapWaves')}</h3><span className="text-xs text-[var(--text-muted)]">{t('resourceKindDetails.mapWavesNote')}</span></div>
          <ul data-testid="map-wave-summary" className="space-y-2">{mapWaves.slice(0, 24).map((wave, index) => <li key={`${wave.wave_start}-${wave.wave_end}-${index}`} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--text)]"><span>{t('resourceKindDetails.mapWaveRange', { start: new Intl.NumberFormat(locale).format(wave.wave_start), end: wave.wave_end === null ? t('resourceKindDetails.mapWaveOngoing') : new Intl.NumberFormat(locale).format(wave.wave_end) })}</span>{wave.is_spike && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">{t('resourceKindDetails.mapWaveSpike')}</span>}</div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t('resourceKindDetails.mapWaveEnemies', { count: wave.enemy_count === null ? '—' : new Intl.NumberFormat(locale).format(wave.enemy_count) })}{wave.boss_count > 0 ? ` · ${t('resourceKindDetails.mapWaveBosses', { count: new Intl.NumberFormat(locale).format(wave.boss_count) })}` : ''}{wave.air_ratio !== null ? ` · ${t('resourceKindDetails.mapWaveAirRatio', { percent: Math.round(wave.air_ratio * 100) })}` : ''}</p>
          </li>)}</ul>
          {mapWaves.length > 24 && <p className="mt-2 text-xs text-[var(--text-muted)]">{t('resourceKindDetails.mapWaveMore', { count: new Intl.NumberFormat(locale).format(mapWaves.length - 24) })}</p>}
        </section>}
      </div>}
      {(extendedMapData.length > 0 || dependencies.length > 0 || Boolean(metadata.rules && typeof metadata.rules === 'object')) && <details className="mt-5 border-t border-[var(--border)] pt-4"><summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">{t('resourceKindDetails.moreMapRules')}</summary><div className="mt-4 space-y-3 text-sm">{extendedMapData.map(([label, value]) => <p key={label}><span className="text-[var(--text-muted)]">{label}: </span>{value}</p>)}{dependencies.length > 0 && <p><span className="text-[var(--text-muted)]">{t('resourceKindDetails.requiredMod')}: </span>{[...new Set(dependencies)].join('、')}</p>}{Boolean(metadata.rules && typeof metadata.rules === 'object') && <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--bg-elevated)] p-3 text-xs">{JSON.stringify(metadata.rules, null, 2)}</pre>}</div></details>}
    </>}
    {kind === 'schematic' && <>
    <section className="mt-5 border-t border-[var(--border)] pt-5" aria-label={t('resourceKindDetails.estimatedBuildTime')}>
      <h3 className="text-base font-semibold text-[var(--text)]">{t('resourceKindDetails.estimatedBuildTime')}</h3>
      <p className="mt-2 text-lg font-semibold tabular-nums text-[var(--text)]" data-testid="schematic-estimated-build-time">
        {estimatedBuildTimeSeconds === null
          ? t('resourceKindDetails.estimateUnavailable')
          : t('resourceKindDetails.estimateAbout', {
            minutes: new Intl.NumberFormat(locale).format(Math.floor(estimatedBuildTimeSeconds / 60)),
            seconds: new Intl.NumberFormat(locale).format(estimatedBuildTimeSeconds % 60),
          })}
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{t('resourceKindDetails.estimateNote')}</p>
    </section>
    {production && <section className="mt-6 border-t border-[var(--border)] pt-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-base font-semibold text-[var(--text)]">{t('resourceKindDetails.production')}</h3><span className="text-xs text-[var(--text-muted)]">{t('resourceKindDetails.theoreticalRate')}</span></div>
      {production.available === false ? <p className="text-sm text-[var(--text-muted)]">{t('resourceKindDetails.noProductionFacilities')}</p> : <>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <RateList title={t('resourceKindDetails.itemInputs')} entries={productionItems.inputs || []} catalog={contentMetadata.items} locale={locale} estimatedLabel={t('resourceKindDetails.estimated')} />
          <RateList title={t('resourceKindDetails.itemOutputs')} entries={productionItems.outputs || []} catalog={contentMetadata.items} locale={locale} estimatedLabel={t('resourceKindDetails.estimated')} />
          <RateList title={t('resourceKindDetails.liquidInputs')} entries={productionLiquids.inputs || []} catalog={contentMetadata.liquids} locale={locale} estimatedLabel={t('resourceKindDetails.estimated')} />
          <RateList title={t('resourceKindDetails.liquidOutputs')} entries={productionLiquids.outputs || []} catalog={contentMetadata.liquids} locale={locale} estimatedLabel={t('resourceKindDetails.estimated')} />
          {production.power && (production.power.generated > 0 || production.power.consumed > 0) && <div className="space-y-1.5 text-sm">
            <h4 className="mb-2 font-medium text-[var(--text-secondary)]">{t('resourceKindDetails.power')}</h4>
            <p className="flex justify-between gap-3"><span className="text-[var(--text-muted)]">{t('resourceKindDetails.generated')}</span><span className="font-semibold tabular-nums">{formatRate(production.power.generated, locale)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span></p>
            <p className="flex justify-between gap-3"><span className="text-[var(--text-muted)]">{t('resourceKindDetails.consumed')}</span><span className="font-semibold tabular-nums">{formatRate(production.power.consumed, locale)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span></p>
            <p className="flex justify-between gap-3"><span className="text-[var(--text-muted)]">{production.power.net < 0 ? t('resourceKindDetails.powerDeficit') : t('resourceKindDetails.powerSurplus')}</span><span className={`font-semibold tabular-nums ${production.power.net < 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{formatRate(Math.abs(production.power.net), locale)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span></p>
          </div>}
        </div>
        {(productionItems.internal?.length || productionLiquids.internal?.length) ? <details className="mt-4 border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">{t('resourceKindDetails.internalFlows')}</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{[...(productionItems.internal || []), ...(productionLiquids.internal || [])].map((entry) => <li key={entry.id} className="flex min-w-0 justify-between gap-3 text-sm"><span className="truncate text-[var(--text)]">{contentMetadata.items[entry.id]?.name || contentMetadata.liquids[entry.id]?.name || entry.name || entry.id}</span><span className="shrink-0 text-right tabular-nums text-[var(--text-secondary)]">{t('resourceKindDetails.producedConsumedNet', { produced: formatRate(entry.produced || 0, locale), consumed: formatRate(entry.consumed || 0, locale), net: formatRate(entry.net || 0, locale) })}</span></li>)}</ul></details> : null}
        {Array.isArray(production.warnings) && production.warnings.length > 0 && <ul className="mt-4 space-y-1 text-xs text-[var(--text-muted)]">{production.warnings.map((warning: { type?: string; blockId?: string; blockName?: string; count?: number | null; message?: string }, index: number) => <li key={`${warning.type}-${warning.blockId}-${index}`}>{typeof warning.count === 'number' ? t('resourceKindDetails.warningCount', { count: new Intl.NumberFormat(locale).format(warning.count) }) : t('resourceKindDetails.warningIncluded')} {contentMetadata.blocks[warning.blockId || '']?.name || warning.blockName || warning.blockId || t('resourceKindDetails.block')}: {warning.message || (warning.type === 'boost-not-simulated' ? t('resourceKindDetails.warningBoostNotSimulated') : warning.type === 'unknown-content' ? t('resourceKindDetails.warningUnknownContent') : t('resourceKindDetails.warningRateOmitted'))}</li>)}</ul>}
      </>}
    </section>}
    {!production && <p className="mt-5 text-sm text-[var(--text-muted)]">{t('resourceKindDetails.analysisUnavailable')}</p>}
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      {requirements.length > 0 && <section className="min-w-0"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">{t('resourceKindDetails.buildingMaterials')}</h3><ul className="grid grid-cols-2 gap-2">{sortedRequirements.map((item, index) => {
        const id = item.item || '';
        const content = contentMetadata.items[id];
        return <li key={`${id || 'material'}-${index}`} title={id || undefined} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-sm">
          <ContentIcon entry={content} kind="item" />
          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{content?.name || id || t('resourceKindDetails.material')}</span>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">{item.amount ?? '—'}</span>
        </li>;
      })}</ul></section>}
      {blockTypes.length > 0 && <section className="min-w-0"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">{t('resourceKindDetails.blockComposition', { count: blockTypes.length })}</h3><ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">{sortedBlockTypes.map((item, index) => {
        const id = item.name || '';
        const content = contentMetadata.blocks[id];
        return <li key={`${id || 'block'}-${index}`} title={id || undefined} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-sm">
          <ContentIcon entry={content} kind="block" />
          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{content?.name || id || t('resourceKindDetails.block')}</span>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">× {item.count ?? '—'}</span>
        </li>;
      })}</ul></section>}
      {dependencies.length > 0 && <p className="text-sm"><span className="text-[var(--text-muted)]">{t('resourceKindDetails.requiredMod')}: </span><span className="text-[var(--text)]">{[...new Set(dependencies)].join('、')}</span></p>}
    </div></>}
    {(kind === 'mod' || kind === 'server_plugin' || kind === 'development_tool' || kind === 'texture_ui' || kind === 'save') && <>
      {resource.metadata?.supported_versions?.length ? <div className="mt-5"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">{t('resourceKindDetails.supportedVersions')}</h3><div className="flex flex-wrap gap-2">{resource.metadata.supported_versions.map((version) => <span key={version} className="rounded bg-[var(--bg-elevated)] px-2.5 py-1 text-sm text-[var(--text-secondary)]">{version}</span>)}</div></div> : null}
      {resource.metadata?.compatibility?.length ? <div className="mt-4"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">{t('resourceKindDetails.platforms')}</h3><div className="flex flex-wrap gap-2">{resource.metadata.compatibility.map((platform) => <span key={platform} className="rounded bg-[var(--bg-elevated)] px-2.5 py-1 text-sm text-[var(--text-secondary)]">{platform}</span>)}</div></div> : null}
      {dependencies.length > 0 && <p className="mt-4 text-sm"><span className="text-[var(--text-muted)]">{t('resourceKindDetails.dependencies')}: </span><span className="text-[var(--text)]">{[...new Set(dependencies)].join('、')}</span></p>}
    </>}
    {kind === 'game_version' && <p className="mt-4 text-sm text-[var(--text-secondary)]">{t('resourceKindDetails.gameVersionNote')}</p>}
    <p className="mt-5 text-xs text-[var(--text-muted)]">{resourceFileSummary(resource).join(' · ')}</p>
  </section>;
}
