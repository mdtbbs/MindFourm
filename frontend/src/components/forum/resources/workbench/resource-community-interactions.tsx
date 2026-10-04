'use client';

import { useEffect, useState } from 'react';
import {
  createResourceV2Relation,
  getResourceV2ModIssueReports,
  getResourceV2MapFeedback,
  getResourceV2ModCompatibility,
  getResourceV2ModConflicts,
  submitResourceV2MapFeedback,
  submitResourceV2ModCompatibilityReport,
  submitResourceV2ModConflict,
  submitResourceV2ModIssueReport,
  type ResourceWorkbenchV2Response,
  type ResourceWorkbenchV2Version,
  type ResourceV2MapFeedbackAggregate,
  type ResourceV2ModCompatibilityReport,
  type ResourceV2ModConflict,
  type ResourceV2ModConflictMemberInput,
  type ResourceV2ModIssueReport,
} from '@/lib/api/v1/resources';
import { useI18n } from '@/i18n/provider';

type Translator = (key: string, values?: Record<string, string | number>) => string;

function CommunityCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="group rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-[var(--text)] [&::-webkit-details-marker]:hidden">
      <span>{title}</span><span aria-hidden="true" className="text-[var(--text-muted)] transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <div className="space-y-4 border-t border-[var(--border)] p-4">{children}</div>
  </details>;
}

function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'success' | 'error' }) {
  const style = tone === 'error'
    ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
    : tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200';
  return <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${style}`}>{children}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-sm font-medium text-[var(--text-secondary)]">{label}{children}</label>;
}

function inputClass(): string {
  return 'mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)]';
}

function ActionButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return <button type="submit" disabled={disabled} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{children}</button>;
}

function PrivacyReminder({ t }: { t: Translator }) {
  return <Notice>{t('resourceWorkbenchV2.community.privacyReminder')} {t('resourceWorkbenchV2.community.attachmentsUnavailable')}</Notice>;
}

function ModCommunity({
  workbench,
  version,
  locale,
  t,
}: {
  workbench: ResourceWorkbenchV2Response;
  version: ResourceWorkbenchV2Version | null;
  locale: string;
  t: Translator;
}) {
  const [compatibilityReports, setCompatibilityReports] = useState<ResourceV2ModCompatibilityReport[]>([]);
  const [conflicts, setConflicts] = useState<ResourceV2ModConflict[]>([]);
  const [issueReports, setIssueReports] = useState<ResourceV2ModIssueReport[]>([]);
  const [issuePagination, setIssuePagination] = useState<{ next_cursor: string | null; has_more: boolean }>({ next_cursor: null, has_more: false });
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueLoadingMore, setIssueLoadingMore] = useState(false);
  const [issueLoadError, setIssueLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [compatStatus, setCompatStatus] = useState<ResourceV2ModCompatibilityReport['status']>('working');
  const [gameVersion, setGameVersion] = useState('');
  const [platform, setPlatform] = useState('');
  const [runtime, setRuntime] = useState('');
  const [compatBody, setCompatBody] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [conflictTitle, setConflictTitle] = useState('');
  const [conflictBody, setConflictBody] = useState('');
  const [gameVersionMin, setGameVersionMin] = useState('');
  const [gameVersionMax, setGameVersionMax] = useState('');
  const [otherMembers, setOtherMembers] = useState<Array<{ resource_public_id: string; version_public_id: string; version_constraint: string }>>([
    { resource_public_id: '', version_public_id: '', version_constraint: '' },
  ]);

  useEffect(() => {
    if (!version) {
      setCompatibilityReports([]);
      setConflicts([]);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError('');
    void Promise.all([
      getResourceV2ModCompatibility(workbench.resource.public_id, version.public_id),
      getResourceV2ModConflicts(workbench.resource.public_id),
    ]).then(([compatibility, conflictsPage]) => {
      if (!active) return;
      setCompatibilityReports(compatibility.reports);
      setConflicts(conflictsPage.items);
    }).catch((caught) => {
      if (active) setLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.loadFailed'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t, version, workbench.resource.public_id]);

  useEffect(() => {
    let active = true;
    setIssueLoading(true); setIssueLoadError('');
    void getResourceV2ModIssueReports(workbench.resource.public_id, { limit: 10 })
      .then((page) => {
        if (!active) return;
        setIssueReports(page.items);
        setIssuePagination(page.pagination);
      })
      .catch((caught) => { if (active) setIssueLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.issueReportsLoadFailed')); })
      .finally(() => { if (active) setIssueLoading(false); });
    return () => { active = false; };
  }, [t, workbench.resource.public_id]);

  const loadMoreIssueReports = async () => {
    if (!issuePagination.next_cursor) return;
    setIssueLoadingMore(true); setIssueLoadError('');
    try {
      const page = await getResourceV2ModIssueReports(workbench.resource.public_id, { limit: 10, cursor: issuePagination.next_cursor });
      setIssueReports((current) => [...current, ...page.items]);
      setIssuePagination(page.pagination);
    } catch (caught) { setIssueLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.issueReportsLoadFailed')); }
    finally { setIssueLoadingMore(false); }
  };

  const submitCompatibility = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!version) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await submitResourceV2ModCompatibilityReport(workbench.resource.public_id, version.public_id, {
        status: compatStatus as 'working' | 'partial' | 'cannot_start' | 'crash' | 'performance' | 'multiplayer',
        game_version: gameVersion.trim() || undefined,
        platform_key: platform.trim() || undefined,
        runtime: runtime ? runtime as 'java' | 'js' | 'hybrid' | 'content' : undefined,
        body: compatBody.trim() || undefined,
      });
      setNotice(t('resourceWorkbenchV2.community.compatibilitySaved'));
      setCompatBody('');
      const result = await getResourceV2ModCompatibility(workbench.resource.public_id, version.public_id);
      setCompatibilityReports(result.reports);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.submitFailed')); }
    finally { setBusy(false); }
  };

  const submitIssue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!version) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await submitResourceV2ModIssueReport(workbench.resource.public_id, version.public_id, { title: issueTitle.trim(), body: issueBody.trim() });
      setNotice(t('resourceWorkbenchV2.community.issueSaved'));
      setIssueTitle(''); setIssueBody('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.submitFailed')); }
    finally { setBusy(false); }
  };

  const submitConflict = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!version) return;
    const current: ResourceV2ModConflictMemberInput = {
      resource_public_id: workbench.resource.public_id,
      version_public_id: version.public_id,
    };
    const members = [current, ...otherMembers.map((member) => ({
      resource_public_id: member.resource_public_id.trim(),
      version_public_id: member.version_public_id.trim(),
      version_constraint: member.version_constraint.trim() || undefined,
    }))];
    if (members.some((member) => !member.resource_public_id || !member.version_public_id)) {
      setError(t('resourceWorkbenchV2.community.conflictMembersRequired'));
      return;
    }
    if (new Set(members.map((member) => member.resource_public_id)).size !== members.length) {
      setError(t('resourceWorkbenchV2.community.conflictDistinctMods'));
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      await submitResourceV2ModConflict({
        title: conflictTitle.trim() || undefined,
        body: conflictBody.trim() || undefined,
        game_version_min: gameVersionMin.trim() || undefined,
        game_version_max: gameVersionMax.trim() || undefined,
        members,
      });
      setNotice(t('resourceWorkbenchV2.community.conflictSaved'));
      setConflictTitle(''); setConflictBody(''); setGameVersionMin(''); setGameVersionMax('');
      setOtherMembers([{ resource_public_id: '', version_public_id: '', version_constraint: '' }]);
      const result = await getResourceV2ModConflicts(workbench.resource.public_id);
      setConflicts(result.items);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.submitFailed')); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    {!version ? <Notice>{t('resourceWorkbenchV2.community.selectVersionFirst')}</Notice> : <>
      <CommunityCard title={t('resourceWorkbenchV2.community.compatibilityReports')}>
        <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.loginPhoneRequired')}</p>
        <PrivacyReminder t={t} />
        {compatibilityReports.length ? <ul className="space-y-2">{compatibilityReports.map((report) => <li key={report.public_id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <p className="font-semibold text-[var(--text)]">{t(`resourceWorkbenchV2.community.status.${report.status}`)}{report.game_version ? ` · ${report.game_version}` : ''}{report.platform ? ` · ${report.platform}` : ''}{report.runtime ? ` · ${report.runtime}` : ''}</p>
          {report.body && <p className="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{report.body}</p>}
          {report.author_response && <p className="mt-2 rounded bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)]">{t('resourceWorkbenchV2.community.authorResponse')}: {report.author_response}</p>}
        </li>)}</ul> : !loading && <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.noCompatibilityReports')}</p>}
        {loading && <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.loading')}</p>}
        <form onSubmit={submitCompatibility} className="space-y-3 rounded-lg bg-[var(--bg-elevated)] p-3 sm:p-4">
          <h4 className="font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.community.submitCompatibility')}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('resourceWorkbenchV2.community.statusLabel')}><select className={inputClass()} value={compatStatus} onChange={(event) => setCompatStatus(event.target.value as typeof compatStatus)}>{(['working', 'partial', 'cannot_start', 'crash', 'performance', 'multiplayer'] as const).map((status) => <option key={status} value={status}>{t(`resourceWorkbenchV2.community.status.${status}`)}</option>)}</select></Field>
            <Field label={t('resourceWorkbenchV2.community.gameVersion')}><input className={inputClass()} maxLength={80} value={gameVersion} onChange={(event) => setGameVersion(event.target.value)} /></Field>
            <Field label={t('resourceWorkbenchV2.community.platform')}><input className={inputClass()} maxLength={50} value={platform} onChange={(event) => setPlatform(event.target.value)} placeholder="desktop / Android" /></Field>
            <Field label={t('resourceWorkbenchV2.community.runtime')}><select className={inputClass()} value={runtime} onChange={(event) => setRuntime(event.target.value)}><option value="">{t('resourceWorkbenchV2.community.unspecified')}</option>{(['java', 'js', 'hybrid', 'content'] as const).map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          </div>
          <Field label={t('resourceWorkbenchV2.community.details')}><textarea className={`${inputClass()} min-h-24`} maxLength={20_000} value={compatBody} onChange={(event) => setCompatBody(event.target.value)} /></Field>
          <ActionButton disabled={busy}>{busy ? t('resourceWorkbenchV2.community.submitting') : t('resourceWorkbenchV2.community.submit')}</ActionButton>
        </form>
      </CommunityCard>

      <CommunityCard title={t('resourceWorkbenchV2.community.issueReports')}>
        <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.loginPhoneRequired')}</p>
        <PrivacyReminder t={t} />
        {issueLoading && <p role="status" className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.issueReportsLoading')}</p>}
        {issueLoadError && <Notice tone="error">{t('resourceWorkbenchV2.community.issueReportsLoadFailed')}: {issueLoadError}</Notice>}
        {!issueLoading && !issueLoadError && issueReports.length === 0 && <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.noPublicIssueReports')}</p>}
        {issueReports.length > 0 && <ul className="space-y-2">{issueReports.map((report) => {
          const reportVersion = workbench.versions.find((item) => item.public_id === report.version_public_id);
          const fixedVersion = workbench.versions.find((item) => item.public_id === report.fixed_version_public_id);
          return <li key={report.public_id} className="min-w-0 rounded-lg border border-[var(--border)] p-3 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><h4 className="break-words font-semibold text-[var(--text)]">{report.title}</h4><span className="shrink-0 rounded-full bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-muted)]">{t(`resourceWorkbenchV2.community.issueStatus.${report.status}`)}</span></div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.issueVersion')}: {reportVersion?.display_version || reportVersion?.version || report.version_public_id} · <time dateTime={report.created_at}>{new Date(report.created_at).toLocaleDateString(locale)}</time></p>
            <p className="mt-2 whitespace-pre-wrap break-words text-[var(--text-secondary)]">{report.body}</p>
            {report.author_response && <div className="mt-3 rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs font-semibold text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.authorResponse')}{report.author_response_status ? ` · ${t(`resourceWorkbenchV2.community.issueStatus.${report.author_response_status}`)}` : ''}</p><p className="mt-1 whitespace-pre-wrap break-words text-[var(--text-secondary)]">{report.author_response}</p></div>}
            {fixedVersion && <p className="mt-2 text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.fixedInVersion')}: {fixedVersion.display_version || fixedVersion.version}</p>}
          </li>;
        })}</ul>}
        {issuePagination.has_more && <button type="button" disabled={issueLoadingMore} onClick={() => void loadMoreIssueReports()} className="min-h-11 w-full rounded-lg border border-[var(--border)] px-4 text-sm font-medium text-[var(--primary)] disabled:opacity-50 sm:w-auto">{issueLoadingMore ? t('resourceWorkbenchV2.community.submitting') : t('resourceWorkbenchV2.community.loadMoreIssues')}</button>}
        <form onSubmit={submitIssue} className="space-y-3">
          <Field label={t('resourceWorkbenchV2.community.issueTitle')}><input className={inputClass()} required maxLength={255} value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} /></Field>
          <Field label={t('resourceWorkbenchV2.community.details')}><textarea className={`${inputClass()} min-h-32`} required maxLength={20_000} value={issueBody} onChange={(event) => setIssueBody(event.target.value)} /></Field>
          <ActionButton disabled={busy}>{busy ? t('resourceWorkbenchV2.community.submitting') : t('resourceWorkbenchV2.community.submitIssue')}</ActionButton>
        </form>
      </CommunityCard>

      <CommunityCard title={t('resourceWorkbenchV2.community.modConflicts')}>
        <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.conflictHelp')}</p>
        <PrivacyReminder t={t} />
        {conflicts.length ? <ul className="space-y-2">{conflicts.map((conflict) => <li key={conflict.public_id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <p className="font-semibold text-[var(--text)]">{conflict.title || t('resourceWorkbenchV2.community.untitledConflict')} · {t(`resourceWorkbenchV2.community.conflictStatus.${conflict.status}`)}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{conflict.members.map((member) => member.title).join(' + ')}</p>
          {conflict.body && <p className="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{conflict.body}</p>}
          {conflict.author_response && <p className="mt-2 rounded bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)]">{t('resourceWorkbenchV2.community.authorResponse')}: {conflict.author_response}</p>}
        </li>)}</ul> : !loading && <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.noConflicts')}</p>}
        {loadError && <Notice tone="error">{loadError}</Notice>}
        <form onSubmit={submitConflict} className="space-y-3 rounded-lg bg-[var(--bg-elevated)] p-3 sm:p-4">
          <h4 className="font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.community.submitConflict')}</h4>
          <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.currentModMember', { resource: workbench.resource.title, version: version.display_version || version.version })}</p>
          {otherMembers.map((member, index) => <div key={index} className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('resourceWorkbenchV2.community.memberResourceUuid')}><input className={inputClass()} required value={member.resource_public_id} onChange={(event) => setOtherMembers((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, resource_public_id: event.target.value } : row))} /></Field>
              <Field label={t('resourceWorkbenchV2.community.memberVersionUuid')}><input className={inputClass()} required value={member.version_public_id} onChange={(event) => setOtherMembers((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, version_public_id: event.target.value } : row))} /></Field>
            </div>
            <Field label={t('resourceWorkbenchV2.community.versionConstraint')}><input className={inputClass()} maxLength={255} value={member.version_constraint} onChange={(event) => setOtherMembers((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, version_constraint: event.target.value } : row))} /></Field>
            {otherMembers.length > 1 && <button type="button" onClick={() => setOtherMembers((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="min-h-10 text-sm text-red-600">{t('resourceWorkbenchV2.community.removeMember')}</button>}
          </div>)}
          <button type="button" disabled={otherMembers.length >= 9} onClick={() => setOtherMembers((rows) => [...rows, { resource_public_id: '', version_public_id: '', version_constraint: '' }])} className="min-h-10 rounded border border-[var(--border)] px-3 text-sm text-[var(--primary)] disabled:opacity-50">{t('resourceWorkbenchV2.community.addMember')}</button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('resourceWorkbenchV2.community.issueTitle')}><input className={inputClass()} maxLength={255} value={conflictTitle} onChange={(event) => setConflictTitle(event.target.value)} /></Field>
            <Field label={t('resourceWorkbenchV2.community.gameVersionMin')}><input className={inputClass()} maxLength={80} value={gameVersionMin} onChange={(event) => setGameVersionMin(event.target.value)} /></Field>
            <Field label={t('resourceWorkbenchV2.community.gameVersionMax')}><input className={inputClass()} maxLength={80} value={gameVersionMax} onChange={(event) => setGameVersionMax(event.target.value)} /></Field>
          </div>
          <Field label={t('resourceWorkbenchV2.community.details')}><textarea className={`${inputClass()} min-h-24`} maxLength={20_000} value={conflictBody} onChange={(event) => setConflictBody(event.target.value)} /></Field>
          <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.conflictStartsUnverified')}</p>
          <ActionButton disabled={busy}>{busy ? t('resourceWorkbenchV2.community.submitting') : t('resourceWorkbenchV2.community.submit')}</ActionButton>
        </form>
      </CommunityCard>
    </>}
    {loadError && !conflicts.length && <Notice tone="error">{loadError}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
  </div>;
}

function MapFeedback({
  workbench,
  version,
  t,
}: {
  workbench: ResourceWorkbenchV2Response;
  version: ResourceWorkbenchV2Version | null;
  t: Translator;
}) {
  const [aggregate, setAggregate] = useState<ResourceV2MapFeedbackAggregate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ difficulty: '', resource_sufficiency: '', balance: '', multiplayer_experience: '' });
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!version) { setAggregate(null); return; }
    let active = true;
    setLoading(true); setError('');
    void getResourceV2MapFeedback(workbench.resource.public_id, version.public_id)
      .then((result) => { if (active) setAggregate(result.aggregate); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.loadFailed')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t, version, workbench.resource.public_id]);

  const fields = [
    ['difficulty', 'difficulty_average'],
    ['resource_sufficiency', 'resource_sufficiency_average'],
    ['balance', 'balance_average'],
    ['multiplayer_experience', 'multiplayer_experience_average'],
  ] as const;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!version) return;
    const input: Record<string, unknown> = {};
    for (const [field] of fields) if (values[field]) input[field] = Number(values[field]);
    if (body.trim()) input.body = body.trim();
    if (!Object.keys(input).length) { setError(t('resourceWorkbenchV2.community.feedbackRequired')); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await submitResourceV2MapFeedback(workbench.resource.public_id, version.public_id, input as { difficulty?: number; resource_sufficiency?: number; balance?: number; multiplayer_experience?: number; body?: string });
      setAggregate(result.aggregate);
      setNotice(t('resourceWorkbenchV2.community.feedbackSaved'));
      setBody('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.submitFailed')); }
    finally { setBusy(false); }
  };

  return <CommunityCard title={t('resourceWorkbenchV2.community.mapFeedback')}>
    {!version ? <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.selectVersionFirst')}</p> : <>
      <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.loginPhoneRequired')}</p>
      <div className="grid gap-2 sm:grid-cols-2" aria-label={t('resourceWorkbenchV2.community.feedbackAggregate')}>
        <div className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.feedbackCount')}</p><p className="mt-1 text-lg font-semibold text-[var(--text)]">{aggregate?.feedback_count ?? (loading ? '…' : '0')}</p></div>
        {fields.map(([field, average]) => <div key={field} className="rounded-lg bg-[var(--bg-elevated)] p-3"><p className="text-xs text-[var(--text-muted)]">{t(`resourceWorkbenchV2.community.feedback.${field}`)}</p><p className="mt-1 text-lg font-semibold text-[var(--text)]">{aggregate?.[average] == null ? t('resourceWorkbenchV2.community.noFeedback') : Number(aggregate[average]).toLocaleString(undefined, { maximumFractionDigits: 1 })}</p></div>)}
      </div>
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-[var(--border)] p-3 sm:p-4">
        <h4 className="font-semibold text-[var(--text)]">{t('resourceWorkbenchV2.community.submitFeedback')}</h4>
        <div className="grid gap-3 sm:grid-cols-2">{fields.map(([field]) => <Field key={field} label={t(`resourceWorkbenchV2.community.feedback.${field}`)}><select className={inputClass()} value={values[field]} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}><option value="">{t('resourceWorkbenchV2.community.noRating')}</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score} / 5</option>)}</select></Field>)}</div>
        <Field label={t('resourceWorkbenchV2.community.details')}><textarea className={`${inputClass()} min-h-24`} maxLength={5_000} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
        <ActionButton disabled={busy}>{busy ? t('resourceWorkbenchV2.community.submitting') : t('resourceWorkbenchV2.community.submitFeedback')}</ActionButton>
      </form>
    </>}
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
  </CommunityCard>;
}

function RelationForm({
  workbench,
  version,
  onCreated,
  t,
}: {
  workbench: ResourceWorkbenchV2Response;
  version: ResourceWorkbenchV2Version | null;
  onCreated: () => void;
  t: Translator;
}) {
  const [targetId, setTargetId] = useState('');
  const [context, setContext] = useState<'opening' | 'production' | 'defense' | 'logistics' | 'general'>('general');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canEdit = workbench.permissions.can_manage && ['owner', 'maintainer'].includes(workbench.permissions.role || '');
  if (!canEdit) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!targetId.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await createResourceV2Relation(workbench.resource.public_id, {
        target_resource_public_id: targetId.trim(),
        relation_type: 'recommended_for',
        relation_context: context,
        source_version_public_id: version?.public_id,
      });
      setNotice(result.created ? t('resourceWorkbenchV2.community.relationCreated') : t('resourceWorkbenchV2.community.relationAlreadyExists'));
      setTargetId('');
      onCreated();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.submitFailed')); }
    finally { setBusy(false); }
  };

  return <CommunityCard title={t('resourceWorkbenchV2.community.createRelationTitle')}>
    <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.relationHelp')}</p>
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('resourceWorkbenchV2.community.targetResourceUuid')}><input className={inputClass()} required maxLength={36} value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></Field>
      <Field label={t('resourceWorkbenchV2.community.relationContext')}><select className={inputClass()} value={context} onChange={(event) => setContext(event.target.value as typeof context)}>{(['opening', 'production', 'defense', 'logistics', 'general'] as const).map((item) => <option key={item} value={item}>{t(`resourceWorkbenchV2.community.context.${item}`)}</option>)}</select></Field>
      <ActionButton disabled={busy}>{busy ? t('resourceWorkbenchV2.community.submitting') : t('resourceWorkbenchV2.community.createRelation')}</ActionButton>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
  </CommunityCard>;
}

export default function ResourceCommunityInteractions({
  workbench,
  version,
  onRelationsChanged,
}: {
  workbench: ResourceWorkbenchV2Response;
  version: ResourceWorkbenchV2Version | null;
  onRelationsChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const isMod = workbench.resource.resource_kind === 'mod';
  const isMap = workbench.resource.resource_kind === 'map';
  return <section aria-label={t('resourceWorkbenchV2.community.interactions')} className="space-y-4">
    {isMod && <ModCommunity workbench={workbench} version={version} locale={locale} t={t} />}
    {isMap && <MapFeedback workbench={workbench} version={version} t={t} />}
    <RelationForm workbench={workbench} version={version} onCreated={onRelationsChanged} t={t} />
  </section>;
}
