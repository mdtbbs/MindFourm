'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, Clock3, HardDrive, LoaderCircle, Pin, RotateCcw, Trash2, Pencil, RefreshCw } from 'lucide-react';
import { fetchV1, V1ApiError } from '@/lib/api/v1/transport';
import {
  createGameSaveDownload, deleteGameSave, deleteGameSaveSnapshot, getGameSaveHistory,
  getGameSaveQuota, listGameSaves, pinGameSaveSnapshot, renameGameSave,
  restoreGameSaveSnapshot, type GameSaveQuota, type GameSaveSlot, type GameSaveSnapshot,
} from '@/lib/api/v1/game-saves';
import { useI18n } from '@/i18n/provider';
import { confirmDialog, promptDialog } from '@/store/interaction-dialog-store';
import { buildPublicApiUrl } from '@/lib/api/client';
import { siteProfile } from '@/config/site-profile';

type Capability = { cloud_saves_v1: boolean };

export default function CloudSavesPage() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [quota, setQuota] = useState<GameSaveQuota | null>(null);
  const [slots, setSlots] = useState<GameSaveSlot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<GameSaveSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const selected = useMemo(() => slots.find((slot) => slot.id === selectedId) || null, [slots, selectedId]);

  const loadAll = useCallback(async (preferredId?: string | null) => {
    setError('');
    setLoading(true);
    try {
      const capability = await fetchV1<Capability>('/capabilities');
      setEnabled(Boolean(capability.cloud_saves_v1));
      if (!capability.cloud_saves_v1) return;
      const [nextQuota, nextSlots] = await Promise.all([getGameSaveQuota(), listGameSaves()]);
      setQuota(nextQuota);
      setSlots(nextSlots);
      const nextId = preferredId && nextSlots.some((slot) => slot.id === preferredId)
        ? preferredId
        : selectedIdRef.current && nextSlots.some((slot) => slot.id === selectedIdRef.current) ? selectedIdRef.current : nextSlots[0]?.id || null;
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
      if (nextId) {
        setHistoryLoading(true);
        setHistory(await getGameSaveHistory(nextId));
      } else setHistory([]);
    } catch (cause) {
      setError(errorMessage(cause, t('cloudSaves.loadFailed')));
    } finally {
      setHistoryLoading(false);
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const selectSlot = async (slotId: string) => {
    selectedIdRef.current = slotId;
    setSelectedId(slotId);
    setHistoryLoading(true);
    setError('');
    try { setHistory(await getGameSaveHistory(slotId)); }
    catch (cause) { setError(errorMessage(cause, t('cloudSaves.historyFailed'))); setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const download = async (slot: GameSaveSlot, snapshotId: string) => {
    setBusy(`download:${snapshotId}`);
    setError('');
    try {
      const grant = await createGameSaveDownload(slot.id, snapshotId);
      const anchor = document.createElement('a');
      anchor.href = buildPublicApiUrl(grant.download.url);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.referrerPolicy = 'no-referrer';
      anchor.download = grant.download.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) { setError(errorMessage(cause, t('cloudSaves.downloadFailed'))); }
    finally { setBusy(null); }
  };

  const rename = async (slot: GameSaveSlot) => {
    const answer = await promptDialog({
      title: t('cloudSaves.renamePrompt'),
      label: t('cloudSaves.renamePrompt'),
      defaultValue: slot.name,
      maxLength: 80,
      required: true,
    });
    const name = answer?.trim();
    if (!name || name === slot.name) return;
    setBusy(`rename:${slot.id}`);
    setError('');
    try {
      await renameGameSave(slot.id, name);
      await loadAll(slot.id);
    } catch (cause) { setError(errorMessage(cause, t('cloudSaves.renameFailed'))); }
    finally { setBusy(null); }
  };

  const removeSlot = async (slot: GameSaveSlot) => {
    if (!await confirmDialog({ message: t('cloudSaves.deleteSlotConfirm'), destructive: true })) return;
    setBusy(`delete-slot:${slot.id}`);
    setError('');
    try { await deleteGameSave(slot.id); await loadAll(null); }
    catch (cause) { setError(errorMessage(cause, t('cloudSaves.deleteFailed'))); }
    finally { setBusy(null); }
  };

  const restore = async (snapshot: GameSaveSnapshot) => {
    if (!selected) return;
    if (!await confirmDialog({ message: t('cloudSaves.restoreConfirm', { revision: snapshot.revision }), confirmLabel: t('cloudSaves.restoreConfirmLabel'), destructive: true })) return;
    setBusy(`restore:${snapshot.id}`);
    setError('');
    try {
      await restoreGameSaveSnapshot(selected.id, snapshot.id, selected.current_snapshot?.id || null);
      await loadAll(selected.id);
    } catch (cause) { setError(errorMessage(cause, t('cloudSaves.restoreFailed'))); }
    finally { setBusy(null); }
  };

  const togglePin = async (snapshot: GameSaveSnapshot) => {
    if (!selected) return;
    setBusy(`pin:${snapshot.id}`);
    setError('');
    try {
      await pinGameSaveSnapshot(selected.id, snapshot.id, !snapshot.pinned);
      setHistory((items) => items.map((item) => item.id === snapshot.id ? { ...item, pinned: !item.pinned } : item));
    } catch (cause) { setError(errorMessage(cause, t('cloudSaves.updateFailed'))); }
    finally { setBusy(null); }
  };

  const removeSnapshot = async (snapshot: GameSaveSnapshot) => {
    if (!selected || !await confirmDialog({ message: t('cloudSaves.deleteSnapshotConfirm', { revision: snapshot.revision }), destructive: true })) return;
    setBusy(`delete-snapshot:${snapshot.id}`);
    setError('');
    try {
      await deleteGameSaveSnapshot(selected.id, snapshot.id);
      setHistory((items) => items.filter((item) => item.id !== snapshot.id));
      await loadAll(selected.id);
    } catch (cause) { setError(errorMessage(cause, t('cloudSaves.deleteFailed'))); }
    finally { setBusy(null); }
  };

  if (loading) return <main className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16" aria-live="polite"><LoaderCircle className="h-5 w-5 animate-spin" /><span className="ml-2">{t('cloudSaves.loading')}</span></main>;
  if (enabled === null) return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-2xl font-semibold">{t('cloudSaves.title')}</h1><p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error || t('cloudSaves.loadFailed')}</p><button type="button" onClick={() => void loadAll()} className="mt-4 rounded border border-[var(--border)] px-3 py-2 text-sm">{t('cloudSaves.refresh')}</button><Link className="ml-4 inline-block text-sm text-primary hover:underline" href="/tools">{t('tools.backToTools')}</Link></main>;
  if (enabled === false) return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-2xl font-semibold">{t('cloudSaves.title')}</h1><p className="mt-3 text-sm text-[var(--text-secondary)]">{t('cloudSaves.disabled')}</p><Link className="mt-5 inline-block text-sm text-primary hover:underline" href="/tools">{t('tools.backToTools')}</Link></main>;

  const percent = quota ? Math.min(100, Math.round((quota.used_bytes / Math.max(1, quota.limit_bytes)) * 100)) : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-7 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="mb-3 flex items-center gap-2 text-sm text-[var(--text-muted)]"><Link href="/tools" className="hover:text-[var(--text)]">{t('tools.title')}</Link><span>/</span><span>{t('cloudSaves.title')}</span></nav>
          <h1 className="text-2xl font-semibold text-[var(--text)]">{t('cloudSaves.title')}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('cloudSaves.privateNotice')}</p>
        </div>
        <button type="button" onClick={() => void loadAll(selectedId)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]" aria-label={t('cloudSaves.refresh')}>
          <RefreshCw className="h-4 w-4" />{t('cloudSaves.refresh')}
        </button>
      </div>

      {error && <div role="alert" className="mb-4 rounded-md border border-red-300/50 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</div>}

      {quota && <section aria-label={t('cloudSaves.quota')} className="mb-6 border-y border-[var(--border)] py-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="inline-flex items-center gap-2 font-medium text-[var(--text)]"><HardDrive className="h-4 w-4" />{t('cloudSaves.quota')}</div>
          <div className="tabular-nums text-[var(--text-secondary)]">{formatBytes(quota.used_bytes)} / {formatBytes(quota.limit_bytes)} <span className="ml-1 text-[var(--text-muted)]">({percent}%)</span></div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-[var(--bg-elevated)]"><div className={`h-full ${percent >= 100 ? 'bg-red-500' : 'bg-[var(--primary)]'}`} style={{ width: `${percent}%` }} /></div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span>{t('cloudSaves.slotUsage', { used: quota.slots.used, limit: quota.slots.limit })}</span>
          <span>{t('cloudSaves.retention', { count: quota.retention.max_unpinned_versions_per_slot, days: quota.retention.max_unpinned_age_days })}</span>
        </div>
        {percent >= 80 && percent < 100 && <p className="mt-2 text-xs text-[var(--text-secondary)]">{t('cloudSaves.quotaHint')}</p>}
        {percent >= 100 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('cloudSaves.quotaFull')}</p>}
      </section>}

      <div className="grid gap-7 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.7fr)]">
        <section aria-label={t('cloudSaves.slots')}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">{t('cloudSaves.slots')}</h2><span className="text-xs text-[var(--text-muted)]">{slots.length}</span></div>
          {slots.length === 0 ? <div className="border-y border-[var(--border)] py-8 text-sm text-[var(--text-secondary)]">{t('cloudSaves.empty', { site: siteProfile.branding.siteName })}</div> : <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {slots.map((slot) => <li key={slot.id}>
              <button type="button" onClick={() => void selectSlot(slot.id)} aria-current={selectedId === slot.id ? 'true' : undefined} className={`block w-full px-3 py-3 text-left transition-colors ${selectedId === slot.id ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]/60'}`}>
                <span className="block truncate font-medium text-[var(--text)]">{slot.name}</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">{slot.current_snapshot ? t('cloudSaves.revision', { revision: slot.current_snapshot.revision }) : t('cloudSaves.noSnapshot')} · {slot.current_snapshot ? formatDate(slot.current_snapshot.created_at) : formatDate(slot.updated_at)}</span>
              </button>
            </li>)}
          </ul>}
        </section>

        <section aria-label={t('cloudSaves.history')} className="min-w-0">
          {!selected ? <div className="border-y border-[var(--border)] py-10 text-sm text-[var(--text-secondary)]">{t('cloudSaves.chooseSlot')}</div> : <>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="break-words text-base font-semibold">{selected.name}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{selected.current_snapshot ? `${t('cloudSaves.current')}: ${t('cloudSaves.revision', { revision: selected.current_snapshot.revision })}` : t('cloudSaves.noSnapshot')}</p></div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => void rename(selected)} disabled={Boolean(busy)} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"><Pencil className="h-3.5 w-3.5" />{t('cloudSaves.rename')}</button>
                <button type="button" onClick={() => void removeSlot(selected)} disabled={Boolean(busy)} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5" />{t('cloudSaves.delete')}</button>
              </div>
            </div>
            {historyLoading ? <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]"><LoaderCircle className="h-4 w-4 animate-spin" />{t('cloudSaves.loadingHistory')}</div> : history.length === 0 ? <div className="border-y border-[var(--border)] py-8 text-sm text-[var(--text-secondary)]">{t('cloudSaves.emptyHistory')}</div> : <ol className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {history.map((snapshot) => {
                const isCurrent = snapshot.id === selected.current_snapshot?.id;
                return <li key={snapshot.id} className="py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{t('cloudSaves.revision', { revision: snapshot.revision })}</strong>{isCurrent && <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">{t('cloudSaves.current')}</span>}{snapshot.pinned && <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]"><Pin className="h-3 w-3" />{t('cloudSaves.pinned')}</span>}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]"><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(snapshot.created_at)}</span><span>{formatBytes(snapshot.size)}</span><span>{snapshot.game.version ? `${t('cloudSaves.gameVersion')} ${snapshot.game.version}${snapshot.game.build == null ? '' : ` / ${snapshot.game.build}`}` : t('cloudSaves.unknownGameVersion')}</span>{snapshot.save.map_name && <span>{snapshot.save.map_name}</span>}{snapshot.save.wave != null && <span>{t('cloudSaves.wave', { wave: snapshot.save.wave })}</span>}{snapshot.save.playtime_seconds != null && <span>{t('cloudSaves.playtime', { time: formatDuration(snapshot.save.playtime_seconds) })}</span>}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{reasonLabel(snapshot.reason, t)} · {snapshot.source.client_name || t('cloudSaves.unknownClient')}{snapshot.source.device_id ? ` · ${snapshot.source.device_id}` : ''}{snapshot.mods.count ? ` · ${t('cloudSaves.mods', { count: snapshot.mods.count })}` : ''}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <button type="button" onClick={() => void download(selected, snapshot.id)} disabled={Boolean(busy)} title={t('cloudSaves.download')} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"><ArrowDownToLine className="h-3.5 w-3.5" />{t('cloudSaves.download')}</button>
                      {!isCurrent && <button type="button" onClick={() => void restore(snapshot)} disabled={Boolean(busy)} title={t('cloudSaves.restore')} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"><RotateCcw className="h-3.5 w-3.5" />{t('cloudSaves.restore')}</button>}
                      <button type="button" onClick={() => void togglePin(snapshot)} disabled={Boolean(busy)} title={snapshot.pinned ? t('cloudSaves.unpin') : t('cloudSaves.pin')} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"><Pin className="h-3.5 w-3.5" />{snapshot.pinned ? t('cloudSaves.unpin') : t('cloudSaves.pin')}</button>
                      {!isCurrent && <button type="button" onClick={() => void removeSnapshot(snapshot)} disabled={Boolean(busy)} title={t('cloudSaves.deleteSnapshot')} className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"><Trash2 className="h-3.5 w-3.5" />{t('cloudSaves.deleteSnapshot')}</button>}
                    </div>
                  </div>
                </li>;
              })}
            </ol>}
          </>}
        </section>
      </div>
    </main>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index++; }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(amount)} ${units[index]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof V1ApiError ? error.message : error instanceof Error ? error.message : fallback;
}

function reasonLabel(reason: string, t: (key: string) => string): string {
  const key: Record<string, string> = {
    manual: 'manualReason', before_launch: 'beforeLaunchReason', after_exit: 'afterExitReason', periodic: 'periodicReason',
    restore: 'restoreReason', conflict: 'conflictReason', import: 'importReason',
  };
  return t(`cloudSaves.${key[reason] || 'manualReason'}`);
}
