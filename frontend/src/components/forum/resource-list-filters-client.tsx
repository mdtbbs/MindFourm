'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { motion as motionTokens } from '@/lib/motion';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ResourceCategory } from '@/types';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { RESOURCE_KINDS } from '@/lib/display-labels';
import {
  MAP_FILTER_KEYS,
  MOD_FILTER_KEYS,
  MAX_BLOCK_LENGTH,
  MAX_MOD_FILTER_LENGTH,
  MAX_MAP_DIMENSION,
  MIN_MAP_DIMENSION,
  blockInvalid,
  isBlockFilterKind,
  isMapFilterKind,
  isModFilterKind,
  mapDimensionInvalid,
  mapFilterKeys,
  mapTextFilterKeys,
  mergeResourceQuery,
  modListValue,
  normalizeResourceFilterParams,
  parseModList,
  type ModFilterKey,
} from '@/lib/resources/query';
import { useI18n } from '@/i18n/provider';

interface ResourceFiltersProps {
  categories: ResourceCategory[]; initialCategory?: string; initialSearch?: string; initialSort?: string;
  initialTag?: string; initialSupportedVersion?: string; initialCompatibility?: string; initialResourceKind?: string;
  initialPlanet?: string; initialBlock?: string; initialWidth?: string; initialHeight?: string;
  /** Normalised version-level Mod dependency conditions; map/blueprint only. */
  initialRequiredMods?: string; initialExcludedMods?: string;
  supportedVersions: string[]; compatibilityOptions: string[]; planets: string[];
  /** Publicly required Mod IDs a map/blueprint can be filtered by. */
  modOptions: string[];
}

/** Text conditions kept local while typing; the URL only ever holds committed values. */
const ALL_MAP_TEXT_KEYS = ['block', 'width', 'height'] as const;
type MapTextKey = (typeof ALL_MAP_TEXT_KEYS)[number];

/** Every URL condition this component owns; Clear removes exactly these. */
const OWNED_FILTER_KEYS = [
  'category_id', 'search', 'sort', 'tag', 'supported_version', 'compatibility', 'resource_kind',
  ...MAP_FILTER_KEYS, ...MOD_FILTER_KEYS,
] as const;

export default function ResourceFilters({
  categories, initialCategory, initialSearch, initialSort, initialTag, initialSupportedVersion,
  initialCompatibility, initialResourceKind, initialPlanet, initialBlock, initialWidth, initialHeight,
  initialRequiredMods, initialExcludedMods,
  supportedVersions, compatibilityOptions, planets, modOptions,
}: ResourceFiltersProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get('category_id') || initialCategory || '';
  const urlSearch = searchParams.get('search') || initialSearch || '';
  const sort = searchParams.get('sort') || initialSort || 'created_at';
  const tag = searchParams.get('tag') || initialTag || '';
  const supportedVersion = searchParams.get('supported_version') || initialSupportedVersion || '';
  const compatibility = searchParams.get('compatibility') || initialCompatibility || '';
  const resourceKind = searchParams.get('resource_kind') || initialResourceKind || '';
  // Each kind renders exactly the conditions it can answer: a map gets
  // planet/width/height, a blueprint gets block/width/height. The URL is
  // canonicalised on the server, so anything hidden here is already gone.
  const showMapFilters = isMapFilterKind(resourceKind);
  const showBlockFilter = isBlockFilterKind(resourceKind);
  const showPlanetFilter = mapFilterKeys(resourceKind).includes('planet');
  const planet = showPlanetFilter ? searchParams.get('planet') || initialPlanet || '' : '';
  const urlBlock = showBlockFilter ? searchParams.get('block') || initialBlock || '' : '';
  const urlWidth = showMapFilters ? searchParams.get('width') || initialWidth || '' : '';
  const urlHeight = showMapFilters ? searchParams.get('height') || initialHeight || '' : '';
  // Same rule as the map conditions: only the kind that carries version-level
  // dependency evidence renders the Mod controls, and the server has already
  // dropped these keys from the URL for every other kind.
  const showModFilters = isModFilterKind(resourceKind);
  const urlRequiredMods = showModFilters ? searchParams.get('required_mods') || initialRequiredMods || '' : '';
  const urlExcludedMods = showModFilters ? searchParams.get('excluded_mods') || initialExcludedMods || '' : '';
  // The submit path reads the same rule as the render path (`mapTextFilterKeys`
  // is `mapFilterKeys` filtered to text values), so a kind that stops rendering
  // a field also stops committing it.
  const mapTextKeys = mapTextFilterKeys(resourceKind);
  const [localSearch, setLocalSearch] = useState(urlSearch);
  const [localTag, setLocalTag] = useState(tag);
  const [localMapValues, setLocalMapValues] = useState<Record<MapTextKey, string>>({ block: urlBlock, width: urlWidth, height: urlHeight });
  const [localMods, setLocalMods] = useState<Record<ModFilterKey, string>>({ required_mods: urlRequiredMods, excluded_mods: urlExcludedMods });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const mobilePanel = useRef<HTMLElement>(null);
  const pendingQueries = useRef<string[]>([]);
  const reduceMotion = useReducedMotion();

  const closeMobileFilters = () => {
    setMobileFiltersOpen(false);
    window.requestAnimationFrame(() => filterTrigger.current?.focus());
  };

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      const controls = Array.from(mobilePanel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]') || []);
      controls.find((control) => control.getClientRects().length > 0)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMobileFilters(); return; }
      if (event.key !== 'Tab' || !mobilePanel.current) return;
      const focusable = Array.from(mobilePanel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]'))
        .filter((control) => control.getClientRects().length > 0);
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.cancelAnimationFrame(focusFrame); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [mobileFiltersOpen]);

  useEffect(() => setLocalSearch(urlSearch), [urlSearch]);
  useEffect(() => setLocalTag(tag), [tag]);
  // Each field syncs only from its own URL value, so committing one condition
  // never discards text still being typed in another.
  useEffect(() => setLocalMapValues((current) => ({ ...current, block: urlBlock })), [urlBlock]);
  useEffect(() => setLocalMapValues((current) => ({ ...current, width: urlWidth })), [urlWidth]);
  useEffect(() => setLocalMapValues((current) => ({ ...current, height: urlHeight })), [urlHeight]);
  // Each Mod field syncs only from its own URL value, exactly like the map
  // fields, so committing one never discards text typed into the other.
  useEffect(() => setLocalMods((current) => ({ ...current, required_mods: urlRequiredMods })), [urlRequiredMods]);
  useEffect(() => setLocalMods((current) => ({ ...current, excluded_mods: urlExcludedMods })), [urlExcludedMods]);

  /**
   * A commit chains off the last query this component navigated to, not off the
   * `searchParams` of the current render: two commits in a row (a keyboard Tab
   * through two text conditions, no pause) both start from the same render, and
   * the second would otherwise overwrite the first with a stale snapshot.
   *
   * The chain is a queue rather than a single slot because navigations are not
   * rendered in order under load: an in-flight navigation can land *after* a
   * later one, so a render that is not the newest is evidence of nothing. Only
   * a render matching queue entry `k` proves entries after it are still ahead,
   * and those are the ones a later commit must keep chaining onto.
   */
  const commitQuery = useCallback((query: string) => {
    pendingQueries.current = [...pendingQueries.current.filter((pending) => pending !== query), query];
    router.push(query ? `/resources?${query}` : '/resources');
  }, [router]);

  const updateFilters = useCallback((updates: Record<string, string | null>) => {
    const tail = pendingQueries.current[pendingQueries.current.length - 1] ?? searchParams.toString();
    commitQuery(mergeResourceQuery(tail, updates));
  }, [commitQuery, searchParams]);

  // A render either caught up with the newest navigation — the URL is authority
  // again — or it caught up with an older one that overtook it, which says only
  // that everything newer is still pending. Matching `k` in the queue therefore
  // keeps `k+1…` and drops the rest; no match means a back/forward navigation
  // this component did not make, so the queue is void.
  const renderedQuery = searchParams.toString();
  useEffect(() => {
    const position = pendingQueries.current.indexOf(renderedQuery);
    pendingQueries.current = position < 0 ? [] : pendingQueries.current.slice(position + 1);
  }, [renderedQuery]);

  const removeFilter = (key: string) => {
    if (key === 'search') setLocalSearch('');
    if (key === 'tag') setLocalTag('');
    if ((ALL_MAP_TEXT_KEYS as readonly string[]).includes(key)) setLocalMapValues((current) => ({ ...current, [key]: '' }));
    if ((MOD_FILTER_KEYS as readonly string[]).includes(key)) setLocalMods((current) => ({ ...current, [key]: '' }));
    updateFilters({ [key]: null });
  };

  /**
   * Removing one Mod keeps the rest of its condition. The remaining tokens are
   * re-serialised through the same normaliser the commits use, so a chip removal
   * cannot leave a value shape the URL normaliser would rewrite.
   */
  const removeModToken = (key: ModFilterKey, token: string) => {
    const committed = key === 'required_mods' ? urlRequiredMods : urlExcludedMods;
    const remaining = parseModList(committed).filter((item) => item !== token);
    const value = modListValue(remaining);
    setLocalMods((current) => ({ ...current, [key]: value || '' }));
    updateFilters({ [key]: value });
  };

  useEffect(() => {
    const timer = setTimeout(() => { if (localSearch !== urlSearch) updateFilters({ search: localSearch || null }); }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, urlSearch, updateFilters]);

  /**
   * Map text fields commit on blur, on Enter or when the mobile sheet applies.
   * A rejected value stays in its field with the message; committing several
   * fields goes out as one navigation so Apply cannot drop a sibling condition.
   */
  const commitMapFields = (keys: readonly MapTextKey[]) => {
    const updates: Record<string, string | null> = {};
    for (const key of keys) {
      const value = localMapValues[key].trim();
      if (key !== 'block' && mapDimensionInvalid(value)) continue;
      if (key === 'block' && blockInvalid(value)) continue;
      const committed = key === 'block' ? urlBlock : key === 'width' ? urlWidth : urlHeight;
      if (value !== committed) updates[key] = value || null;
    }
    if (!Object.keys(updates).length) return;
    updateFilters(updates);
  };

  /**
   * One rule for "this draft is refused": the field has text but no commit can
   * turn it into a condition the backend accepts, because its normalised token
   * list exceeds the length limit. The renderer, the commit and the revisit
   * resync all read this, so a value that cannot be committed can never be
   * mistaken for one that was, and one that can never carries an error message.
   */
  const modDraftRejected = (value: string) => {
    const tokens = parseModList(value);
    return tokens.length > 0 && modListValue(tokens) === null;
  };

  /**
   * Mod conditions commit on blur, on Enter or when the mobile sheet applies.
   * The value is normalised through the same parser the URL normaliser uses, so
   * the query a visitor commits is byte-identical to the one SSR would derive
   * from it: whitespace and duplicates drop, and an empty field removes the key.
   * A list longer than the backend accepts is not committed at all — it would
   * turn the whole page into a 400 error state. Refusing to commit is *not*
   * removing the condition: committing `null` here would drop a Mod the URL
   * already carries and widen the result set, so the field keeps the URL value
   * instead, exactly like an out-of-range map dimension.
   */
  const commitModFields = (keys: readonly ModFilterKey[]) => {
    const updates: Record<string, string | null> = {};
    for (const key of keys) {
      const committed = key === 'required_mods' ? urlRequiredMods : urlExcludedMods;
      if (modDraftRejected(localMods[key])) continue;
      const value = modListValue(parseModList(localMods[key]));
      if (value === (committed || null)) continue;
      updates[key] = value;
    }
    if (!Object.keys(updates).length) return;
    updateFilters(updates);
  };

  /**
   * A rejected value stays visible while the user is in the field (so the
   * message explains itself), but must not survive as a value the URL never
   * accepted. Returning to the field — or reopening the sheet — restores the
   * committed URL value.
   */
  const resyncRejectedFields = () => {
    setLocalMapValues((current) => {
      const next = { ...current };
      for (const key of ALL_MAP_TEXT_KEYS) {
        const invalid = key === 'block' ? blockInvalid(current[key]) : mapDimensionInvalid(current[key]);
        if (invalid) next[key] = key === 'block' ? urlBlock : key === 'width' ? urlWidth : urlHeight;
      }
      return next;
    });
    setLocalMods((current) => {
      const next = { ...current };
      for (const key of MOD_FILTER_KEYS) {
        if (modDraftRejected(current[key])) next[key] = key === 'required_mods' ? urlRequiredMods : urlExcludedMods;
      }
      return next;
    });
  };

  const openMobileFilters = () => {
    // Reopening the sheet starts from the URL, never from a rejected draft —
    // the Mod fields follow the same rule as the map ones.
    setLocalMapValues({ block: urlBlock, width: urlWidth, height: urlHeight });
    setLocalMods({ required_mods: urlRequiredMods, excluded_mods: urlExcludedMods });
    setMobileFiltersOpen(true);
  };

  const clearAll = () => {
    setLocalSearch('');
    setLocalTag('');
    setLocalMapValues({ block: '', width: '', height: '' });
    setLocalMods({ required_mods: '', excluded_mods: '' });
    // Same outlet as every other navigation — it reads and updates the pending
    // chain too, so a commit in the same render window chains off what Clear
    // left behind instead of reviving a condition Clear just removed.
    const params = new URLSearchParams(searchParams.toString());
    for (const key of OWNED_FILTER_KEYS) params.delete(key);
    commitQuery(normalizeResourceFilterParams(params).toString());
  };

  const applyMobileFilters = () => {
    if (showMapFilters) commitMapFields(mapTextKeys);
    if (showModFilters) commitModFields(MOD_FILTER_KEYS);
    closeMobileFilters();
  };

  // One count per URL condition, so the badge matches the chips below it.
  const activeModCount = parseModList(urlRequiredMods).length + parseModList(urlExcludedMods).length;
  const activeFilters = [
    selectedCategory, urlSearch, tag, supportedVersion, compatibility, resourceKind,
    planet, urlBlock, urlWidth, urlHeight,
  ].filter(Boolean).length + activeModCount;
  const hasFilters = activeFilters > 0 || sort !== 'created_at';
  const chipClass = (active: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${active ? 'bg-[var(--primary-button)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text)]'}`;
  const inputClass = 'min-w-0 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]';
  const dimensionHint = t('resourceList.dimensionHint', { min: MIN_MAP_DIMENSION, max: MAX_MAP_DIMENSION });

  const sortLabels: Record<string, string> = {
    created_at: t('resourceList.latest'),
    updated_at: t('resourceList.recentlyUpdated'),
    download_count: t('resourceList.mostDownloaded'),
    rating_average: t('resourceList.highestRated'),
    rating_count: t('resourceList.mostRated'),
  };
  const sortLabel = sortLabels[sort] || sortLabels.created_at;
  const kindLabel = (value: string, fallback: string) => {
    const translated = t(`resourceList.resourceKind.${value}`);
    return translated === `resourceList.resourceKind.${value}` ? fallback : translated;
  };
  // `onRemove` defaults to the whole-key removal; a Mod chip passes its own
  // handler because removing one token keeps the rest of the condition.
  const removableChip = (key: string, label: string, onRemove?: () => void) => <button key={key} type="button" onClick={onRemove ?? (() => removeFilter(key))} aria-label={t('resourceList.removeFilter', { filter: label })} className="inline-flex min-h-9 max-w-full items-center gap-1.5 border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-xs text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><span className="truncate">{label}</span><X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></button>;

  const fieldId = (scope: string, key: string) => `resource-${scope}-filter-${key}`;

  /** Shared by the desktop menu and the mobile sheet, so both expose the same controls. */
  const mapFilterFields = (scope: string) => <div role="group" aria-label={t('resourceList.mapFilters')} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
    {showPlanetFilter && <label className="grid gap-1 text-xs text-[var(--text-muted)]" htmlFor={fieldId(scope, 'planet')}>{t('resourceList.planet')}
      <select id={fieldId(scope, 'planet')} value={planet} onChange={(event) => updateFilters({ planet: event.target.value || null })} className={inputClass}>
        <option value="">{t('resourceList.allPlanets')}</option>{planets.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>}
    {showBlockFilter && (() => {
      const invalid = blockInvalid(localMapValues.block);
      const errorId = `${fieldId(scope, 'block')}-message`;
      return <label className="grid gap-1 text-xs text-[var(--text-muted)]" htmlFor={fieldId(scope, 'block')}>{t('resourceList.block')}
      <input
        id={fieldId(scope, 'block')}
        value={localMapValues.block}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={errorId}
        onChange={(event) => setLocalMapValues((current) => ({ ...current, block: event.target.value }))}
        onFocus={resyncRejectedFields}
        onBlur={() => commitMapFields(['block'])}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitMapFields(['block']); } }}
        placeholder={t('resourceList.blockPlaceholder')}
        className={`${inputClass} ${invalid ? 'input-error' : ''}`}
      />
      <span id={errorId} role={invalid ? 'alert' : undefined} className={`text-[11px] ${invalid ? 'input-error-message' : 'text-[var(--text-muted)]'}`}>
        {invalid ? t('resourceList.blockTooLong', { max: MAX_BLOCK_LENGTH }) : t('resourceList.blockHint', { max: MAX_BLOCK_LENGTH })}
      </span>
    </label>;
    })()}
    {(['width', 'height'] as const).map((key) => {
      const invalid = mapDimensionInvalid(localMapValues[key]);
      const errorId = `${fieldId(scope, key)}-message`;
      return <label key={key} className="grid gap-1 text-xs text-[var(--text-muted)]" htmlFor={fieldId(scope, key)}>
        {key === 'width' ? t('resourceList.width') : t('resourceList.height')}
        <input
          id={fieldId(scope, key)}
          value={localMapValues[key]}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          onChange={(event) => setLocalMapValues((current) => ({ ...current, [key]: event.target.value }))}
          onFocus={resyncRejectedFields}
          onBlur={() => commitMapFields([key])}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitMapFields([key]); } }}
          placeholder={t('resourceList.dimensionPlaceholder')}
          className={`${inputClass} ${invalid ? 'input-error' : ''}`}
        />
        <span id={errorId} role={invalid ? 'alert' : undefined} className={`text-[11px] ${invalid ? 'input-error-message' : 'text-[var(--text-muted)]'}`}>
          {invalid ? t('resourceList.dimensionInvalid', { min: MIN_MAP_DIMENSION, max: MAX_MAP_DIMENSION }) : dimensionHint}
        </span>
      </label>;
    })}
  </div>;

  /**
   * Mod conditions, rendered by the desktop menu, the mobile sheet — one
   * definition, so both surfaces expose the same controls and the same hint.
   * The field mirrors the map text fields: local while typing, committed on
   * blur/Enter/Apply.
   */
  const modFilterFields = (scope: string) => <div role="group" aria-label={t('resourceList.modFilters')} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
    {MOD_FILTER_KEYS.map((key) => {
      const invalid = modDraftRejected(localMods[key]);
      const errorId = `${fieldId(scope, key)}-message`;
      return <label key={key} className="grid gap-1 text-xs text-[var(--text-muted)]" htmlFor={fieldId(scope, key)}>
        {key === 'required_mods' ? t('resourceList.requiredMods') : t('resourceList.excludedMods')}
        <input
          id={fieldId(scope, key)}
          value={localMods[key]}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          list={key === 'required_mods' && modOptions.length ? `${fieldId(scope, key)}-options` : undefined}
          onChange={(event) => setLocalMods((current) => ({ ...current, [key]: event.target.value }))}
          onFocus={resyncRejectedFields}
          onBlur={() => commitModFields([key])}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitModFields([key]); } }}
          placeholder={t('resourceList.modsPlaceholder')}
          className={`${inputClass} ${invalid ? 'input-error' : ''}`}
        />
        <span id={errorId} role={invalid ? 'alert' : undefined} className={`text-[11px] ${invalid ? 'input-error-message' : 'text-[var(--text-muted)]'}`}>
          {invalid ? t('resourceList.modsTooLong', { max: MAX_MOD_FILTER_LENGTH }) : t('resourceList.modsHint', { max: MAX_MOD_FILTER_LENGTH })}
        </span>
        {key === 'required_mods' && modOptions.length ? <datalist id={`${fieldId(scope, key)}-options`}>{modOptions.map((value) => <option key={value} value={value} />)}</datalist> : null}
      </label>;
    })}
  </div>;

  const topicField = (scope: string) => <label className="grid gap-1 text-xs text-[var(--text-muted)]" htmlFor={fieldId(scope, 'topic')}>{t('resourceList.topic')}<select id={fieldId(scope, 'topic')} value={selectedCategory} onChange={(event) => updateFilters({ category_id: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allTopics')}</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>;
  const platformField = (scope: string) => <label className="grid gap-1 text-xs text-[var(--text-muted)]" htmlFor={fieldId(scope, 'platform')}>{t('resourceList.platform')}<select id={fieldId(scope, 'platform')} value={compatibility} onChange={(event) => updateFilters({ compatibility: event.target.value || null })} className={inputClass}><option value="">{t('resourceList.allPlatforms')}</option>{compatibilityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>;
  const tagField = (scope: string) => <label className="grid gap-1 text-xs text-[var(--text-muted)] sm:col-span-2" htmlFor={fieldId(scope, 'tag')}>{t('resourceList.tag')}<input id={fieldId(scope, 'tag')} value={localTag} onChange={(event) => setLocalTag(event.target.value)} onBlur={() => { if (localTag !== tag) updateFilters({ tag: localTag || null }); }} onKeyDown={(event) => { if (event.key === 'Enter' && localTag !== tag) updateFilters({ tag: localTag || null }); }} placeholder={t('resourceList.enterTag')} className={inputClass} /></label>;

  return <section aria-label={t('resourceList.filters')} className="mb-5 space-y-3">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
      <label className="relative min-w-0 flex-1"><span className="sr-only">{t('resourceList.search')}</span><Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" /><input type="search" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && localSearch !== urlSearch) updateFilters({ search: localSearch || null }); }} placeholder={t('resourceList.search')} className={`${inputClass} w-full pl-10`} /></label>
      <div className="flex min-w-0 shrink-0 flex-wrap gap-2 sm:flex-nowrap">
        <label className="sr-only" htmlFor="resource-version">{t('resourceList.gameVersion')}</label><select id="resource-version" value={supportedVersion} onChange={(event) => updateFilters({ supported_version: event.target.value || null })} className={inputClass}>
          <option value="">{t('resourceList.allVersions')}</option>{supportedVersions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <label className="sr-only" htmlFor="resource-sort">{t('resourceList.sort')}</label><select id="resource-sort" value={sort} onChange={(event) => updateFilters({ sort: event.target.value || null })} className={inputClass}>
          <option value="created_at">{t('resourceList.latest')}</option><option value="updated_at">{t('resourceList.recentlyUpdated')}</option><option value="download_count">{t('resourceList.mostDownloaded')}</option><option value="rating_average">{t('resourceList.highestRated')}</option><option value="rating_count">{t('resourceList.mostRated')}</option>
        </select>
        <button ref={filterTrigger} type="button" className={`${inputClass} inline-flex min-h-11 items-center gap-2 sm:hidden`} onClick={openMobileFilters} aria-haspopup="dialog" aria-controls="resource-mobile-filters"><SlidersHorizontal className="h-4 w-4" />{t('resourceList.filter')}{activeFilters > 0 && <span className="bg-[var(--primary-soft)] px-1.5 text-xs text-[var(--primary-text)]">{activeFilters}</span>}</button>
        <details className="relative hidden sm:block">
          <summary className="flex h-full cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"><SlidersHorizontal className="h-4 w-4" />{t('resourceList.filter')}{activeFilters > 0 && <span className="rounded-full bg-[var(--primary-soft)] px-1.5 text-xs text-[var(--primary-text)]">{activeFilters}</span>}</summary>
          <div className="absolute right-0 z-20 mt-2 grid w-[min(90vw,34rem)] gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-md sm:grid-cols-2">
            {topicField('desktop')}
            {platformField('desktop')}
            {showMapFilters ? mapFilterFields('desktop') : null}
            {showModFilters ? modFilterFields('desktop') : null}
            {tagField('desktop')}
          </div>
        </details>
      </div>
    </div>
    <AnimatePresence>
    {mobileFiltersOpen && <motion.div id="resource-mobile-filters" className="fixed inset-0 z-[70] flex items-end sm:hidden" role="dialog" aria-modal="true" aria-label={t('resourceList.filters')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : motionTokens.normal, ease: motionTokens.easing }}>
      <button type="button" tabIndex={-1} aria-label={t('resourceList.closeFilters')} className="absolute inset-0 bg-black/45" onClick={closeMobileFilters} />
      <motion.section ref={mobilePanel} className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[var(--radius-card)] border-t border-[var(--border)] bg-[var(--bg-card)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4" initial={reduceMotion ? false : { opacity: 0.9, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }} transition={{ duration: reduceMotion ? 0 : motionTokens.panel, ease: motionTokens.easing }}>
        <div className="mb-4 flex items-center justify-between"><h2 id="resource-filter-title" className="text-base font-semibold text-[var(--text)]">{t('resourceList.filterResources')}</h2><button type="button" aria-label={t('resourceList.closeFilters')} onClick={closeMobileFilters} className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"><X className="h-5 w-5" /></button></div>
        <div className="grid gap-3">
          {topicField('mobile')}
          {platformField('mobile')}
          {showMapFilters ? mapFilterFields('mobile') : null}
          {showModFilters ? modFilterFields('mobile') : null}
          {tagField('mobile')}
        </div>
        <div className="sticky bottom-0 mt-4 flex gap-3 border-t border-[var(--border)] bg-[var(--bg-card)] py-3"><button type="button" onClick={() => { clearAll(); closeMobileFilters(); }} className="min-h-11 flex-1 rounded-[var(--radius)] border border-[var(--border)] px-4 text-sm text-[var(--text-secondary)]">{t('resourceList.clear')}</button><button type="button" onClick={applyMobileFilters} className="min-h-11 flex-1 rounded-[var(--radius)] bg-[var(--primary-button)] px-4 text-sm font-semibold text-white">{t('resourceList.apply')}</button></div>
      </motion.section>
    </motion.div>}
    </AnimatePresence>
    <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1" aria-label={t('resourceList.resourceType')}>
      <button type="button" aria-pressed={!resourceKind} onClick={() => updateFilters({ resource_kind: null })} className={chipClass(!resourceKind)}>{t('resourceList.all')}</button>
      {RESOURCE_KINDS.map(({ value, label }) => <button key={value} type="button" aria-pressed={resourceKind === value} onClick={() => updateFilters({ resource_kind: value })} className={chipClass(resourceKind === value)}>{kindLabel(value, label)}</button>)}
    </div>
    {hasFilters && <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>{t('resourceList.activeFilters', { count: activeFilters + Number(sort !== 'created_at') })}</span>
      {selectedCategory && removableChip('category_id', t('resourceList.topicChip', { value: categories.find((category) => String(category.id) === selectedCategory)?.name || t('resourceList.topic') }))}
      {resourceKind && removableChip('resource_kind', kindLabel(resourceKind, RESOURCE_KINDS.find((kind) => kind.value === resourceKind)?.label || resourceKind))}
      {urlSearch && removableChip('search', t('resourceList.searchChip', { value: urlSearch }))}
      {tag && removableChip('tag', t('resourceList.tagChip', { value: tag }))}
      {supportedVersion && removableChip('supported_version', t('resourceList.versionChip', { value: supportedVersion }))}
      {compatibility && removableChip('compatibility', t('resourceList.platformChip', { value: compatibility }))}
      {showPlanetFilter && planet && removableChip('planet', t('resourceList.planetChip', { value: planet }))}
      {showBlockFilter && urlBlock && removableChip('block', t('resourceList.blockChip', { value: urlBlock }))}
      {showMapFilters && urlWidth && removableChip('width', t('resourceList.widthChip', { value: urlWidth }))}
      {showMapFilters && urlHeight && removableChip('height', t('resourceList.heightChip', { value: urlHeight }))}
      {showModFilters && parseModList(urlRequiredMods).map((token) => removableChip(`required-${token}`, t('resourceList.requiredModChip', { value: token }), () => removeModToken('required_mods', token)))}
      {showModFilters && parseModList(urlExcludedMods).map((token) => removableChip(`excluded-${token}`, t('resourceList.excludedModChip', { value: token }), () => removeModToken('excluded_mods', token)))}
      {sort !== 'created_at' && removableChip('sort', t('resourceList.sortChip', { value: sortLabel }))}
      <button type="button" onClick={clearAll} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 hover:text-[var(--primary-text)]"><X className="h-3.5 w-3.5" />{t('resourceList.clear')}</button>
    </div>}
  </section>;
}
