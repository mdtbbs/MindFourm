import { useEffect, useState } from 'react';
import { Blocks, Package } from 'lucide-react';
import type { Resource } from '@/types';
import { resourceApi } from '@/lib/api/client';
import { resourceCardFacts, resourceFileSummary } from '@/lib/resources/presentation';

type ContentEntry = { name: string; icon: string | null };
type ProductionEntry = { id: string; name?: string; rate?: number; produced?: number; consumed?: number; net?: number; estimated?: boolean };
type ProductionFlow = { inputs?: ProductionEntry[]; outputs?: ProductionEntry[]; internal?: ProductionEntry[] };

function formatRate(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(Number.isFinite(value) ? value : 0);
}

function RateList({ title, entries, catalog }: { title: string; entries: ProductionEntry[]; catalog: Record<string, ContentEntry> }) {
  if (!entries.length) return null;
  return <div className="min-w-0">
    <h4 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">{title}</h4>
    <ul className="space-y-1.5">{entries.map((entry) => {
      const content = catalog[entry.id];
      return <li key={entry.id} className="flex min-w-0 items-center gap-2 text-sm" title={entry.estimated ? '概率产物的长期理论期望值' : undefined}>
        <ContentIcon entry={content} kind="item" />
        <span className="min-w-0 flex-1 truncate text-[var(--text)]">{content?.name || entry.name || entry.id}{entry.estimated && <span className="ml-1 text-xs text-[var(--text-muted)]">预计</span>}</span>
        <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">{formatRate(entry.rate || 0)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span>
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

function FactGrid({ resource }: { resource: Resource }) {
  const facts = resourceCardFacts(resource);
  if (!facts.length) return <p className="text-sm text-[var(--text-muted)]">暂无可展示的结构化信息。</p>;
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">{facts.map((fact) => <div key={fact.label}><dt className="text-xs text-[var(--text-muted)]">{fact.label}</dt><dd className="mt-1 break-words font-semibold text-[var(--text)]">{fact.value}</dd></div>)}</dl>;
}

export default function ResourceKindDetails({ resource }: { resource: Resource }) {
  const kind = resource.resource_kind || 'other';
  const metadata = (resource.renderer_metadata || {}) as Record<string, unknown>;
  const title = kind === 'map' ? '地图信息' : kind === 'schematic' ? '蓝图信息' : kind === 'mod' ? 'Mod 信息' : kind === 'game_version' ? '游戏版本信息' : '资源信息';
  const dependencies = [
    ...(Array.isArray(metadata.required_mods) ? metadata.required_mods.filter((item): item is string => typeof item === 'string') : []),
    ...(Array.isArray(metadata.mod_dependencies) ? metadata.mod_dependencies.filter((item): item is string => typeof item === 'string') : []),
  ];
  const requirements = Array.isArray(metadata.requirements) ? metadata.requirements.filter((item): item is { item?: string; amount?: number } => Boolean(item && typeof item === 'object')) : [];
  const blockTypes = Array.isArray(metadata.block_types) ? metadata.block_types.filter((item): item is { name?: string; count?: number } => Boolean(item && typeof item === 'object')) : [];
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
    ['队伍', Array.isArray(metadata.teams) ? metadata.teams.join('、') : ''],
    ['禁用单位', Array.isArray(metadata.banned_units) ? metadata.banned_units.join('、') : ''],
    ['禁用方块', Array.isArray(metadata.banned_blocks) ? metadata.banned_blocks.join('、') : ''],
  ] as Array<[string, string]>).filter(([, value]) => value.length > 0);

  if (!['map', 'schematic', 'mod', 'game_version', 'server_plugin', 'development_tool', 'texture_ui', 'save'].includes(kind)) return null;
  return <section className="border-b border-[var(--border)] py-6">
    <h2 className="mb-5 text-lg font-semibold text-[var(--text)]">{title}</h2>
    <FactGrid resource={resource} />
    {kind === 'map' && <>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        {resource.metadata?.planets?.length ? <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">可用星球</dt><dd className="text-right text-[var(--text)]">{resource.metadata.planets.join('、')}</dd></div> : null}
        {typeof metadata.waves === 'boolean' && <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">波次</dt><dd className="text-[var(--text)]">{metadata.waves ? '启用' : '禁用'}</dd></div>}
        {typeof metadata.core_count === 'number' && <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">核心</dt><dd className="text-[var(--text)]">{metadata.core_count} 个{Array.isArray(metadata.core_teams) && metadata.core_teams.length ? ` · ${metadata.core_teams.join('、')}` : ''}</dd></div>}
      </dl>
      {(extendedMapData.length > 0 || dependencies.length > 0 || Boolean(metadata.rules && typeof metadata.rules === 'object')) && <details className="mt-5 border-t border-[var(--border)] pt-4"><summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">更多地图规则与队伍</summary><div className="mt-4 space-y-3 text-sm">{extendedMapData.map(([label, value]) => <p key={label}><span className="text-[var(--text-muted)]">{label}：</span>{value}</p>)}{dependencies.length > 0 && <p><span className="text-[var(--text-muted)]">需要 Mod：</span>{[...new Set(dependencies)].join('、')}</p>}{Boolean(metadata.rules && typeof metadata.rules === 'object') && <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--bg-elevated)] p-3 text-xs">{JSON.stringify(metadata.rules, null, 2)}</pre>}</div></details>}
    </>}
    {kind === 'schematic' && <>
    {production && <section className="mt-6 border-t border-[var(--border)] pt-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-base font-semibold text-[var(--text)]">生产分析</h3><span className="text-xs text-[var(--text-muted)]">理论满负载产能 · 每秒</span></div>
      {production.available === false ? <p className="text-sm text-[var(--text-muted)]">该蓝图不包含可分析的生产设施。</p> : <>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <RateList title="物品输入" entries={productionItems.inputs || []} catalog={contentMetadata.items} />
          <RateList title="物品输出" entries={productionItems.outputs || []} catalog={contentMetadata.items} />
          <RateList title="液体输入" entries={productionLiquids.inputs || []} catalog={contentMetadata.liquids} />
          <RateList title="液体输出" entries={productionLiquids.outputs || []} catalog={contentMetadata.liquids} />
          {production.power && (production.power.generated > 0 || production.power.consumed > 0) && <div className="space-y-1.5 text-sm">
            <h4 className="mb-2 font-medium text-[var(--text-secondary)]">电力</h4>
            <p className="flex justify-between gap-3"><span className="text-[var(--text-muted)]">发电</span><span className="font-semibold tabular-nums">{formatRate(production.power.generated)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span></p>
            <p className="flex justify-between gap-3"><span className="text-[var(--text-muted)]">耗电</span><span className="font-semibold tabular-nums">{formatRate(production.power.consumed)}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span></p>
            <p className="flex justify-between gap-3"><span className="text-[var(--text-muted)]">{production.power.net < 0 ? '电力缺口' : '电力余量'}</span><span className={`font-semibold tabular-nums ${production.power.net < 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{formatRate(Math.abs(production.power.net))}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">/s</span></span></p>
          </div>}
        </div>
        {(productionItems.internal?.length || productionLiquids.internal?.length) ? <details className="mt-4 border-t border-[var(--border)] pt-3"><summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">内部生产与消耗</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2">{[...(productionItems.internal || []), ...(productionLiquids.internal || [])].map((entry) => <li key={entry.id} className="flex min-w-0 justify-between gap-3 text-sm"><span className="truncate text-[var(--text)]">{contentMetadata.items[entry.id]?.name || contentMetadata.liquids[entry.id]?.name || entry.name || entry.id}</span><span className="shrink-0 text-right tabular-nums text-[var(--text-secondary)]">产 {formatRate(entry.produced || 0)} · 耗 {formatRate(entry.consumed || 0)} · 净 {formatRate(entry.net || 0)}/s</span></li>)}</ul></details> : null}
        {Array.isArray(production.warnings) && production.warnings.length > 0 && <ul className="mt-4 space-y-1 text-xs text-[var(--text-muted)]">{production.warnings.map((warning: { type?: string; blockId?: string; blockName?: string; count?: number | null; message?: string }, index: number) => <li key={`${warning.type}-${warning.blockId}-${index}`}>{typeof warning.count === 'number' ? `${warning.count} 个` : '包含'}{contentMetadata.blocks[warning.blockId || '']?.name || warning.blockName || warning.blockId || '方块'}：{warning.message || (warning.type === 'boost-not-simulated' ? '未计入超速效果' : warning.type === 'unknown-content' ? '内容定义不可用，生产分析不完整' : '未计入理论速率')}</li>)}</ul>}
      </>}
    </section>}
    {!production && <p className="mt-5 text-sm text-[var(--text-muted)]">暂时无法分析该蓝图的生产数据。</p>}
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      {requirements.length > 0 && <section className="min-w-0"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">建造材料</h3><ul className="grid grid-cols-2 gap-2">{sortedRequirements.map((item, index) => {
        const id = item.item || '';
        const content = contentMetadata.items[id];
        return <li key={`${id || 'material'}-${index}`} title={id || undefined} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-sm">
          <ContentIcon entry={content} kind="item" />
          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{content?.name || id || '材料'}</span>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">{item.amount ?? '—'}</span>
        </li>;
      })}</ul></section>}
      {blockTypes.length > 0 && <section className="min-w-0"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">方块组成（{blockTypes.length} 种）</h3><ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">{sortedBlockTypes.map((item, index) => {
        const id = item.name || '';
        const content = contentMetadata.blocks[id];
        return <li key={`${id || 'block'}-${index}`} title={id || undefined} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-sm">
          <ContentIcon entry={content} kind="block" />
          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{content?.name || id || '方块'}</span>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--text)]">× {item.count ?? '—'}</span>
        </li>;
      })}</ul></section>}
      {dependencies.length > 0 && <p className="text-sm"><span className="text-[var(--text-muted)]">需要 Mod：</span><span className="text-[var(--text)]">{[...new Set(dependencies)].join('、')}</span></p>}
    </div></>}
    {(kind === 'mod' || kind === 'server_plugin' || kind === 'development_tool' || kind === 'texture_ui' || kind === 'save') && <>
      {resource.metadata?.supported_versions?.length ? <div className="mt-5"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">支持 Mindustry 版本</h3><div className="flex flex-wrap gap-2">{resource.metadata.supported_versions.map((version) => <span key={version} className="rounded bg-[var(--bg-elevated)] px-2.5 py-1 text-sm text-[var(--text-secondary)]">{version}</span>)}</div></div> : null}
      {resource.metadata?.compatibility?.length ? <div className="mt-4"><h3 className="mb-2 text-sm font-medium text-[var(--text)]">运行平台</h3><div className="flex flex-wrap gap-2">{resource.metadata.compatibility.map((platform) => <span key={platform} className="rounded bg-[var(--bg-elevated)] px-2.5 py-1 text-sm text-[var(--text-secondary)]">{platform}</span>)}</div></div> : null}
      {dependencies.length > 0 && <p className="mt-4 text-sm"><span className="text-[var(--text-muted)]">依赖：</span><span className="text-[var(--text)]">{[...new Set(dependencies)].join('、')}</span></p>}
    </>}
    {kind === 'game_version' && <p className="mt-4 text-sm text-[var(--text-secondary)]">资源版本与游戏 Build 分开显示；仅展示文件解析得到的 Build 信息。</p>}
    <p className="mt-5 text-xs text-[var(--text-muted)]">{resourceFileSummary(resource).join(' · ')}</p>
  </section>;
}
