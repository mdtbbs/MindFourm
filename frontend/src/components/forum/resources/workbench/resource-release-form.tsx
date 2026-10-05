'use client';

import { useState } from 'react';
import { AlertTriangle, FileArchive, Loader2, ScanSearch, UploadCloud } from 'lucide-react';
import {
  analyzeResourceWorkbenchVersionV2,
  createResourceWorkbenchVersionV2,
  type ResourceWorkbenchV2ModVersionAnalysis,
  type ResourceWorkbenchV2RendererVersionAnalysis,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2VersionAnalysis,
  type ResourceWorkbenchV2VersionCreateResponse,
} from '@/lib/api/v1/resources';
import { useI18n } from '@/i18n/provider';
import { getRendererReleaseFacts } from './resource-release-analysis';

type ReleaseChannel = 'release' | 'beta' | 'alpha' | 'snapshot';
type VersionMode = 'semver' | 'compatibility';

function displayFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function primitive(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

export default function ResourceReleaseForm({
  workbench,
  onReleased,
}: {
  workbench: ResourceWorkbenchV2Response;
  onReleased: (result: ResourceWorkbenchV2VersionCreateResponse) => void;
}) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [versionMode, setVersionMode] = useState<VersionMode>('semver');
  const [releaseChannel, setReleaseChannel] = useState<ReleaseChannel>('release');
  const [gameVersionMin, setGameVersionMin] = useState('');
  const [gameVersionMax, setGameVersionMax] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [draftAnalysis, setDraftAnalysis] = useState<ResourceWorkbenchV2VersionAnalysis | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ResourceWorkbenchV2VersionCreateResponse | null>(null);

  const chooseFile = (candidate: File | undefined) => {
    if (!candidate) return;
    const kind = workbench.resource.resource_kind;
    const lowerName = candidate.name.toLowerCase();
    const allowed = kind === 'mod' ? /\.(jar|zip)$/.test(lowerName)
      : kind === 'map' ? lowerName.endsWith('.msav')
        : kind === 'schematic' ? lowerName.endsWith('.msch') : true;
    if (!allowed) {
      setError(t('resourceWorkbenchV2.releaseUnsupportedFile', { kind }));
      return;
    }
    setFile(candidate);
    setDraftAnalysis(null);
    setConfirmed(false);
    setCreated(null);
    setError(null);
  };

  const analyze = async () => {
    if (!file) {
      setError(t('resourceWorkbenchV2.releaseFileRequired'));
      return;
    }
    setAnalyzing(true);
    setError(null);
    setDraftAnalysis(null);
    setConfirmed(false);
    try {
      const data = new FormData();
      data.append('file', file);
      const result = await analyzeResourceWorkbenchVersionV2(workbench.resource.public_id, data);
      if (result.resource_kind !== workbench.resource.resource_kind) {
        throw new Error(t('resourceWorkbenchV2.analysisKindMismatch'));
      }
      setDraftAnalysis(result.analysis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.analysisFailed'));
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !draftAnalysis || !version.trim() || !confirmed || created) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('version', version.trim());
      data.append('version_mode', versionMode);
      data.append('release_channel', releaseChannel);
      if (gameVersionMin.trim()) data.append('game_version_min', gameVersionMin.trim());
      if (gameVersionMax.trim()) data.append('game_version_max', gameVersionMax.trim());
      if (releaseNotes.trim()) data.append('content', releaseNotes.trim());
      const result = await createResourceWorkbenchVersionV2(workbench.resource.public_id, data);
      setCreated(result);
      onReleased(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.releaseSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const modAnalysis = draftAnalysis && 'manifest' in draftAnalysis
    ? draftAnalysis as ResourceWorkbenchV2ModVersionAnalysis
    : null;
  const rendererAnalysis = draftAnalysis && 'renderer_metadata' in draftAnalysis
    ? draftAnalysis as ResourceWorkbenchV2RendererVersionAnalysis
    : null;
  const manifest = modAnalysis?.manifest;
  const manifestFacts = manifest ? [
    [t('resourceWorkbenchV2.modName'), manifest.display_name || manifest.name],
    [t('resourceWorkbenchV2.author'), manifest.author],
    [t('resourceWorkbenchV2.manifestVersion'), manifest.version],
    [t('resourceWorkbenchV2.minimumGameVersion'), manifest.min_game_version],
  ].filter(([, value]) => primitive(value)) as Array<[string, unknown]> : [];
  const canSubmit = Boolean(file && draftAnalysis && version.trim() && confirmed && !submitting && !created);
  const acceptedFiles = workbench.resource.resource_kind === 'mod' ? '.jar,.zip'
    : workbench.resource.resource_kind === 'map' ? '.msav'
      : workbench.resource.resource_kind === 'schematic' ? '.msch' : undefined;
  const rendererFacts = getRendererReleaseFacts(rendererAnalysis?.renderer_metadata || null);

  return <form onSubmit={submit} className="space-y-5">
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
      <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">{t('resourceWorkbenchV2.releaseStepOne')}</p><h3 className="mt-1 text-lg font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.releaseUploadTitle')}</h3><p className="mt-1 text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.releaseUploadDescription')}</p></div>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-center hover:border-[var(--primary)]/60">
        <UploadCloud className="mb-2 h-6 w-6 text-[var(--primary)]" />
        <span className="text-sm font-medium text-[var(--text)]">{file ? file.name : t('resourceWorkbenchV2.releaseChooseFile')}</span>
        <span className="mt-1 text-xs text-[var(--text-muted)]">{file ? displayFileSize(file.size) : t('resourceWorkbenchV2.releaseFileHint')}</span>
        <input type="file" accept={acceptedFiles} disabled={analyzing || submitting} className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />
      </label>
      <button type="button" onClick={analyze} disabled={!file || analyzing || submitting} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:opacity-50"><ScanSearch className="h-4 w-4" />{analyzing ? t('resourceWorkbenchV2.analyzingRelease') : t('resourceWorkbenchV2.analyzeRelease')}</button>
    </section>

    {draftAnalysis && <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
      <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">{t('resourceWorkbenchV2.releaseStepTwo')}</p><h3 className="mt-1 text-lg font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.analysisSummary')}</h3></div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {modAnalysis ? <>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.runtimeType')}</dt><dd className="mt-1 text-sm text-[var(--text)]">{modAnalysis.runtime_type || t('resourceWorkbenchV2.unknown')}</dd></div>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.contentCount')}</dt><dd className="mt-1 text-sm text-[var(--text)]">{modAnalysis.content_count}</dd></div>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.parserVersion')}</dt><dd className="mt-1 break-all text-sm text-[var(--text)]">{modAnalysis.parser_version || t('resourceWorkbenchV2.unknown')}</dd></div>
          {modAnalysis.java && <div className="rounded-lg bg-[var(--bg-elevated)] p-3 sm:col-span-2"><dt className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.javaEntrypoint')}</dt><dd className="mt-1 break-all text-sm text-[var(--text)]">{modAnalysis.java.entrypoint || t('resourceWorkbenchV2.unknown')}</dd><dd className="mt-1 text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.javaPackages', { count: modAnalysis.java.packages.length })} · {t('resourceWorkbenchV2.apiReferences', { count: modAnalysis.java.mindustry_api_references.length + modAnalysis.java.arc_api_references.length })}</dd></div>}
        </> : rendererAnalysis && <>
          <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><dt className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.parserVersion')}</dt><dd className="mt-1 break-all text-sm text-[var(--text)]">{rendererAnalysis.parser_version || t('resourceWorkbenchV2.unknown')}</dd></div>
          {rendererAnalysis.duplicate && <div className="sm:col-span-2"><p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-[var(--text-secondary)]">{t('resourceWorkbenchV2.duplicateFile')}</p></div>}
          {rendererFacts.length > 0 ? <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">{rendererFacts.map(({ key, value }) => <dl key={key} className="rounded-lg border border-[var(--border)] p-3"><dt className="text-xs text-[var(--text-muted)]">{t(`resourceWorkbenchV2.rendererFacts.${key}`)}</dt><dd className="mt-1 break-words text-sm text-[var(--text)]">{value}</dd></dl>)}</div> : <div className="sm:col-span-2"><p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.noRendererMetadata')}</p></div>}
        </>}
      </dl>
      {manifestFacts.length > 0 && <dl className="mt-3 grid gap-3 sm:grid-cols-2">{manifestFacts.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-[var(--border)] p-3"><dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className="mt-1 break-words text-sm text-[var(--text)]">{primitive(value)}</dd></div>)}</dl>}
      {(modAnalysis?.localizations.length || 0) > 0 && modAnalysis && <div className="mt-4"><h4 className="mb-2 text-sm font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.localizations')}</h4><div className="flex flex-wrap gap-2">{modAnalysis.localizations.map((item) => <span key={item.locale} className="rounded-full bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">{item.locale} · {item.percentage}% ({item.translated}/{item.total})</span>)}</div></div>}
      {draftAnalysis.findings.length > 0 ? <ul className="mt-4 space-y-2" aria-label={t('resourceWorkbenchV2.analysisFindings')}>{draftAnalysis.findings.map((finding, index) => <li key={`${finding.code || finding.key}:${index}`} className={`flex gap-2 rounded-lg border p-3 text-sm ${finding.severity === 'ERROR' ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' : finding.severity === 'WARNING' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong className="mr-2 text-xs">{finding.severity}</strong>{finding.message}</span></li>)}</ul> : <p className="mt-4 text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.noFindings')}</p>}
      <p className="mt-4 text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.analysisIsReadOnly')}</p>
    </section>}

    {draftAnalysis && <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
      <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">{t('resourceWorkbenchV2.releaseStepThree')}</p><h3 className="mt-1 text-lg font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.releaseConfirmTitle')}</h3><p className="mt-1 text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.releaseConfirmDescription')}</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.version')}<input required value={version} maxLength={50} onChange={(event) => { setVersion(event.target.value); setCreated(null); }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]" /></label>
        <label className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.versionMode')}<select value={versionMode} onChange={(event) => setVersionMode(event.target.value as VersionMode)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]"><option value="semver">{t('resourceWorkbenchV2.semver')}</option><option value="compatibility">{t('resourceWorkbenchV2.compatibilityMode')}</option></select></label>
        <label className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.releaseChannel')}<select value={releaseChannel} onChange={(event) => setReleaseChannel(event.target.value as ReleaseChannel)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]">{(['release', 'beta', 'alpha', 'snapshot'] as ReleaseChannel[]).map((channel) => <option key={channel} value={channel}>{t(`resourceWorkbenchV2.channel.${channel}`)}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.gameVersionMin')}<input maxLength={80} value={gameVersionMin} onChange={(event) => setGameVersionMin(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]" /></label><label className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.gameVersionMax')}<input maxLength={80} value={gameVersionMax} onChange={(event) => setGameVersionMax(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)]" /></label></div>
      </div>
      <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.releaseNotes')}<textarea value={releaseNotes} maxLength={20_000} onChange={(event) => setReleaseNotes(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm text-[var(--text)]" /></label>
      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" /><span>{t('resourceWorkbenchV2.releaseConfirmCheck', { file: file?.name || '' })}</span></label>
      <button type="submit" disabled={!canSubmit} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}{submitting ? t('resourceWorkbenchV2.submittingRelease') : t('resourceWorkbenchV2.submitRelease')}</button>
    </section>}

    {created && <section role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5"><h3 className="font-semibold text-emerald-800 dark:text-emerald-200">{t('resourceWorkbenchV2.releaseCreated', { version: created.version.display_version || created.version.version, revision: created.revision })}</h3><p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">{t('resourceWorkbenchV2.releaseCreatedDetails')}</p>{created.findings.length > 0 && <ul className="mt-3 space-y-2">{created.findings.map((finding, index) => <li key={`${finding.code || finding.key}:${index}`} className="text-sm text-[var(--text-secondary)]"><strong className="mr-2 text-xs">{finding.severity}</strong>{finding.message}</li>)}</ul>}</section>}
    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
  </form>;
}
