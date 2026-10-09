'use client';

import { useEffect, useState } from 'react';
import {
  deleteResourceV2ReportAttachment,
  downloadResourceV2ReportAttachment,
  listResourceV2ReportAttachments,
  RESOURCE_V2_REPORT_ATTACHMENT_MAX_FILE_BYTES,
  RESOURCE_V2_REPORT_ATTACHMENT_MAX_FILES,
  RESOURCE_V2_REPORT_ATTACHMENT_MAX_TOTAL_BYTES,
  uploadResourceV2ReportAttachment,
  type ResourceV2ReportAttachment,
  type ResourceV2ReportAttachmentKind,
} from '@/lib/api/v1/resource-report-attachments';
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
  return <button type="submit" disabled={disabled} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--primary-button)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{children}</button>;
}

function PrivacyReminder({ t }: { t: Translator }) {
  return <Notice>{t('resourceWorkbenchV2.community.privacyReminder')}</Notice>;
}

const REPORT_ATTACHMENT_EXTENSIONS = new Set(['.log', '.txt', '.json', '.crash', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

function validateReportAttachmentFiles(files: File[], t: Translator): string | null {
  if (files.length > RESOURCE_V2_REPORT_ATTACHMENT_MAX_FILES) return t('resourceWorkbenchV2.community.attachmentTooMany');
  const unsupported = files.find((file) => !REPORT_ATTACHMENT_EXTENSIONS.has(file.name.slice(file.name.lastIndexOf('.')).toLowerCase()));
  if (unsupported) return t('resourceWorkbenchV2.community.attachmentUnsupported', { file: unsupported.name });
  const oversized = files.find((file) => file.size < 1 || file.size > RESOURCE_V2_REPORT_ATTACHMENT_MAX_FILE_BYTES);
  if (oversized) return t('resourceWorkbenchV2.community.attachmentTooLarge', { file: oversized.name });
  if (files.reduce((total, file) => total + file.size, 0) > RESOURCE_V2_REPORT_ATTACHMENT_MAX_TOTAL_BYTES) {
    return t('resourceWorkbenchV2.community.attachmentTotalTooLarge');
  }
  return null;
}

function validateReportAttachmentQuota(
  files: File[],
  existingCount: number,
  existingBytes: number,
  maxFiles: number,
  maxTotalBytes: number,
  t: Translator,
): string | null {
  if (existingCount + files.length > maxFiles) return t('resourceWorkbenchV2.community.attachmentReportLimitReached');
  if (existingBytes + files.reduce((total, file) => total + file.size, 0) > maxTotalBytes) {
    return t('resourceWorkbenchV2.community.attachmentTotalTooLarge');
  }
  return null;
}

function ReportAttachmentPicker({
  files,
  onChange,
  disabled,
  t,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  t: Translator;
}) {
  return <div className="space-y-1">
    <Field label={t('resourceWorkbenchV2.community.reportAttachments')}>
      <input
        className={`${inputClass()} file:mr-3 file:rounded-md file:border-0 file:bg-[var(--bg-elevated)] file:px-3 file:py-2 file:text-sm`}
        type="file"
        multiple
        accept=".log,.txt,.json,.crash,.png,.jpg,.jpeg,.gif,.webp"
        disabled={disabled}
        onChange={(event) => onChange(Array.from(event.currentTarget.files || []))}
      />
    </Field>
    <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.attachmentHelp')}</p>
    {files.length > 0 && <ul className="space-y-1 text-xs text-[var(--text-secondary)]">{files.map((file, index) => <li key={`${file.name}-${file.size}-${index}`} className="break-all">{file.name} · {(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KiB</li>)}</ul>}
  </div>;
}

function UploadedReportAttachments({
  kind,
  reportPublicId,
  attachments,
  onDeleted,
  t,
}: {
  kind: ResourceV2ReportAttachmentKind;
  reportPublicId: string;
  attachments: ResourceV2ReportAttachment[];
  onDeleted: (attachmentPublicId: string) => void;
  t: Translator;
}) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!attachments.length) return null;

  const download = async (attachment: ResourceV2ReportAttachment) => {
    setDownloading(attachment.public_id); setError('');
    try {
      const blob = await downloadResourceV2ReportAttachment(kind, reportPublicId, attachment.public_id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.attachmentDownloadFailed'));
    } finally { setDownloading(null); }
  };

  const remove = async (attachment: ResourceV2ReportAttachment) => {
    setDeleting(attachment.public_id); setError('');
    try {
      await deleteResourceV2ReportAttachment(kind, reportPublicId, attachment.public_id);
      onDeleted(attachment.public_id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.attachmentDeleteFailed'));
    } finally { setDeleting(null); }
  };

  return <div className="space-y-2 rounded-lg bg-[var(--bg-elevated)] p-3">
    <p className="text-xs font-semibold text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.uploadedAttachments')}</p>
    <ul className="space-y-1">{attachments.map((attachment) => <li key={attachment.public_id} className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <span className="break-all text-[var(--text-secondary)]">{attachment.name} · {(attachment.size_bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KiB</span>
      <span className="flex shrink-0 gap-2">
        <button type="button" disabled={downloading !== null || deleting !== null} onClick={() => void download(attachment)} className="min-h-9 rounded border border-[var(--border)] px-3 text-[var(--primary-text)] disabled:opacity-50">{downloading === attachment.public_id ? t('resourceWorkbenchV2.community.downloadingAttachment') : t('resourceWorkbenchV2.community.downloadAttachment')}</button>
        {attachment.can_delete && <button type="button" disabled={downloading !== null || deleting !== null} onClick={() => void remove(attachment)} className="min-h-9 rounded border border-red-500/30 px-3 text-red-700 disabled:opacity-50 dark:text-red-300">{deleting === attachment.public_id ? t('resourceWorkbenchV2.community.deletingAttachment') : t('resourceWorkbenchV2.community.deleteAttachment')}</button>}
      </span>
    </li>)}</ul>
    {error && <Notice tone="error">{error}</Notice>}
  </div>;
}

function ExistingReportAttachments({
  kind,
  reportPublicId,
  initialAttachments,
  t,
}: {
  kind: ResourceV2ReportAttachmentKind;
  reportPublicId: string;
  initialAttachments?: ResourceV2ReportAttachment[];
  t: Translator;
}) {
  const [attachments, setAttachments] = useState<ResourceV2ReportAttachment[] | null>(initialAttachments ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialAttachments) setAttachments(initialAttachments);
  }, [initialAttachments]);

  const load = async () => {
    setLoading(true); setError('');
    try { setAttachments((await listResourceV2ReportAttachments(kind, reportPublicId)).items); }
    catch { setError(t('resourceWorkbenchV2.community.attachmentListUnavailable')); }
    finally { setLoading(false); }
  };

  return <div className="mt-2 space-y-2">
    <button type="button" disabled={loading} onClick={() => void load()} className="min-h-9 rounded border border-[var(--border)] px-3 text-xs text-[var(--primary-text)] disabled:opacity-50">
      {loading ? t('resourceWorkbenchV2.community.loading') : t('resourceWorkbenchV2.community.viewAttachments')}
    </button>
    {attachments?.length === 0 && <p className="text-xs text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.noReportAttachments')}</p>}
    {attachments && attachments.length > 0 && <UploadedReportAttachments
      kind={kind}
      reportPublicId={reportPublicId}
      attachments={attachments}
      onDeleted={(id) => setAttachments((current) => (current || []).filter((item) => item.public_id !== id))}
      t={t}
    />}
    {error && <Notice>{error}</Notice>}
  </div>;
}

async function uploadSelectedReportAttachments(
  kind: ResourceV2ReportAttachmentKind,
  reportPublicId: string,
  files: File[],
): Promise<{ uploaded: ResourceV2ReportAttachment[]; failed: File[] }> {
  const uploaded: ResourceV2ReportAttachment[] = [];
  const failed: File[] = [];
  for (const file of files) {
    try { uploaded.push(await uploadResourceV2ReportAttachment(kind, reportPublicId, file)); }
    catch { failed.push(file); }
  }
  return { uploaded, failed };
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
  const [compatibilityFiles, setCompatibilityFiles] = useState<File[]>([]);
  const [issueFiles, setIssueFiles] = useState<File[]>([]);
  const [compatibilityPendingReportId, setCompatibilityPendingReportId] = useState<string | null>(null);
  const [issuePendingReportId, setIssuePendingReportId] = useState<string | null>(null);
  const [compatibilityPendingVersionId, setCompatibilityPendingVersionId] = useState<string | null>(null);
  const [issuePendingVersionId, setIssuePendingVersionId] = useState<string | null>(null);
  const [compatibilityAttachments, setCompatibilityAttachments] = useState<Record<string, ResourceV2ReportAttachment[]>>({});
  const [issueAttachments, setIssueAttachments] = useState<Record<string, ResourceV2ReportAttachment[]>>({});
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
    if (compatibilityPendingReportId && compatibilityPendingVersionId !== version.public_id) {
      setError(t('resourceWorkbenchV2.community.pendingAttachmentVersionChanged'));
      return;
    }
    const attachmentError = validateReportAttachmentFiles(compatibilityFiles, t);
    if (attachmentError) { setError(attachmentError); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      let reportId = compatibilityPendingReportId;
      if (!reportId) {
        const report = await submitResourceV2ModCompatibilityReport(workbench.resource.public_id, version.public_id, {
          status: compatStatus as 'working' | 'partial' | 'cannot_start' | 'crash' | 'performance' | 'multiplayer',
          game_version: gameVersion.trim() || undefined,
          platform_key: platform.trim() || undefined,
          runtime: runtime ? runtime as 'java' | 'js' | 'hybrid' | 'content' : undefined,
          body: compatBody.trim() || undefined,
        });
        reportId = report.public_id;
        setCompatibilityPendingReportId(reportId);
        setCompatibilityPendingVersionId(version.public_id);
        setCompatBody('');
      }
      const existingAttachments = await listResourceV2ReportAttachments('compatibility', reportId);
      setCompatibilityAttachments((current) => ({ ...current, [reportId!]: existingAttachments.items }));
      const quotaError = validateReportAttachmentQuota(
        compatibilityFiles,
        existingAttachments.items.length,
        existingAttachments.items.reduce((total, attachment) => total + attachment.size_bytes, 0),
        existingAttachments.max_attachments,
        existingAttachments.max_total_size_bytes,
        t,
      );
      if (quotaError) { setError(quotaError); return; }
      if (compatibilityFiles.length) {
        const result = await uploadSelectedReportAttachments('compatibility', reportId, compatibilityFiles);
        if (result.uploaded.length) setCompatibilityAttachments((current) => ({ ...current, [reportId!]: [...existingAttachments.items, ...result.uploaded] }));
        setCompatibilityFiles(result.failed);
        if (result.failed.length) {
          setError(t('resourceWorkbenchV2.community.attachmentUploadFailed'));
          return;
        }
      }
      setCompatibilityPendingReportId(null);
      setCompatibilityPendingVersionId(null);
      setNotice(compatibilityFiles.length ? t('resourceWorkbenchV2.community.reportAndAttachmentsSaved') : t('resourceWorkbenchV2.community.compatibilitySaved'));
      const result = await getResourceV2ModCompatibility(workbench.resource.public_id, version.public_id);
      setCompatibilityReports(result.reports);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.submitFailed')); }
    finally { setBusy(false); }
  };

  const submitIssue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!version) return;
    if (issuePendingReportId && issuePendingVersionId !== version.public_id) {
      setError(t('resourceWorkbenchV2.community.pendingAttachmentVersionChanged'));
      return;
    }
    const attachmentError = validateReportAttachmentFiles(issueFiles, t);
    if (attachmentError) { setError(attachmentError); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      let reportId = issuePendingReportId;
      if (!reportId) {
        const report = await submitResourceV2ModIssueReport(workbench.resource.public_id, version.public_id, { title: issueTitle.trim(), body: issueBody.trim() });
        reportId = report.public_id;
        setIssuePendingReportId(reportId);
        setIssuePendingVersionId(version.public_id);
        setIssueTitle(''); setIssueBody('');
      }
      const existingAttachments = await listResourceV2ReportAttachments('issue', reportId);
      setIssueAttachments((current) => ({ ...current, [reportId!]: existingAttachments.items }));
      const quotaError = validateReportAttachmentQuota(
        issueFiles,
        existingAttachments.items.length,
        existingAttachments.items.reduce((total, attachment) => total + attachment.size_bytes, 0),
        existingAttachments.max_attachments,
        existingAttachments.max_total_size_bytes,
        t,
      );
      if (quotaError) { setError(quotaError); return; }
      if (issueFiles.length) {
        const result = await uploadSelectedReportAttachments('issue', reportId, issueFiles);
        if (result.uploaded.length) setIssueAttachments((current) => ({ ...current, [reportId!]: [...existingAttachments.items, ...result.uploaded] }));
        setIssueFiles(result.failed);
        if (result.failed.length) {
          setError(t('resourceWorkbenchV2.community.attachmentUploadFailed'));
          return;
        }
      }
      setIssuePendingReportId(null);
      setIssuePendingVersionId(null);
      setNotice(issueFiles.length ? t('resourceWorkbenchV2.community.reportAndAttachmentsSaved') : t('resourceWorkbenchV2.community.issueSaved'));
      void getResourceV2ModIssueReports(workbench.resource.public_id, { limit: 10 })
        .then((page) => { setIssueReports(page.items); setIssuePagination(page.pagination); })
        .catch((caught) => { setIssueLoadError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.issueReportsLoadFailed')); });
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
          <ExistingReportAttachments kind="compatibility" reportPublicId={report.public_id} initialAttachments={compatibilityAttachments[report.public_id]} t={t} />
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
          <ReportAttachmentPicker files={compatibilityFiles} onChange={setCompatibilityFiles} disabled={busy} t={t} />
          {compatibilityPendingReportId && <UploadedReportAttachments kind="compatibility" reportPublicId={compatibilityPendingReportId} attachments={compatibilityAttachments[compatibilityPendingReportId] || []} onDeleted={(id) => setCompatibilityAttachments((current) => ({ ...current, [compatibilityPendingReportId]: (current[compatibilityPendingReportId] || []).filter((item) => item.public_id !== id) }))} t={t} />}
          {compatibilityPendingReportId && <Notice>{compatibilityPendingVersionId === version.public_id ? t('resourceWorkbenchV2.community.attachmentRetryNotice') : t('resourceWorkbenchV2.community.pendingAttachmentVersionChanged')}</Notice>}
          <ActionButton disabled={busy || (!!compatibilityPendingReportId && compatibilityPendingVersionId !== version.public_id)}>{busy ? t('resourceWorkbenchV2.community.submitting') : compatibilityPendingReportId ? t('resourceWorkbenchV2.community.retryAttachmentUpload') : t('resourceWorkbenchV2.community.submit')}</ActionButton>
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
            <ExistingReportAttachments kind="issue" reportPublicId={report.public_id} initialAttachments={issueAttachments[report.public_id]} t={t} />
          </li>;
        })}</ul>}
        {issuePagination.has_more && <button type="button" disabled={issueLoadingMore} onClick={() => void loadMoreIssueReports()} className="min-h-11 w-full rounded-lg border border-[var(--border)] px-4 text-sm font-medium text-[var(--primary-text)] disabled:opacity-50 sm:w-auto">{issueLoadingMore ? t('resourceWorkbenchV2.community.submitting') : t('resourceWorkbenchV2.community.loadMoreIssues')}</button>}
        <form onSubmit={submitIssue} className="space-y-3">
          {issuePendingReportId && <Notice>{issuePendingVersionId === version.public_id ? t('resourceWorkbenchV2.community.attachmentRetryNotice') : t('resourceWorkbenchV2.community.pendingAttachmentVersionChanged')}</Notice>}
          {!issuePendingReportId && <>
            <Field label={t('resourceWorkbenchV2.community.issueTitle')}><input className={inputClass()} required maxLength={255} value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} /></Field>
            <Field label={t('resourceWorkbenchV2.community.details')}><textarea className={`${inputClass()} min-h-32`} required maxLength={20_000} value={issueBody} onChange={(event) => setIssueBody(event.target.value)} /></Field>
          </>}
          <ReportAttachmentPicker files={issueFiles} onChange={setIssueFiles} disabled={busy} t={t} />
          {issuePendingReportId && <UploadedReportAttachments kind="issue" reportPublicId={issuePendingReportId} attachments={issueAttachments[issuePendingReportId] || []} onDeleted={(id) => setIssueAttachments((current) => ({ ...current, [issuePendingReportId]: (current[issuePendingReportId] || []).filter((item) => item.public_id !== id) }))} t={t} />}
          <ActionButton disabled={busy || (!!issuePendingReportId && issuePendingVersionId !== version.public_id)}>{busy ? t('resourceWorkbenchV2.community.submitting') : issuePendingReportId ? t('resourceWorkbenchV2.community.retryAttachmentUpload') : t('resourceWorkbenchV2.community.submitIssue')}</ActionButton>
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
          <button type="button" disabled={otherMembers.length >= 9} onClick={() => setOtherMembers((rows) => [...rows, { resource_public_id: '', version_public_id: '', version_constraint: '' }])} className="min-h-10 rounded border border-[var(--border)] px-3 text-sm text-[var(--primary-text)] disabled:opacity-50">{t('resourceWorkbenchV2.community.addMember')}</button>
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
  const [relationType, setRelationType] = useState<'recommended_for' | 'fork_of' | 'successor_of' | 'related'>('recommended_for');
  const [targetId, setTargetId] = useState('');
  const [targetVersionId, setTargetVersionId] = useState('');
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
        relation_type: relationType,
        ...(relationType === 'recommended_for' ? { relation_context: context } : {}),
        source_version_public_id: version?.public_id,
        ...(targetVersionId.trim() ? { target_version_public_id: targetVersionId.trim() } : {}),
      });
      setNotice(result.created ? t('resourceWorkbenchV2.community.relationCreated') : t('resourceWorkbenchV2.community.relationAlreadyExists'));
      setTargetId('');
      setTargetVersionId('');
      onCreated();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.community.submitFailed')); }
    finally { setBusy(false); }
  };

  return <CommunityCard title={t('resourceWorkbenchV2.community.createRelationTitle')}>
    <p className="text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.community.relationHelp')}</p>
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('resourceWorkbenchV2.community.relationType')}><select className={inputClass()} value={relationType} onChange={(event) => setRelationType(event.target.value as typeof relationType)}>{(['recommended_for', 'fork_of', 'successor_of', 'related'] as const).map((item) => <option key={item} value={item}>{t(`resourceWorkbenchV2.community.relationTypes.${item}`)}</option>)}</select></Field>
      <Field label={t('resourceWorkbenchV2.community.targetResourceUuid')}><input className={inputClass()} required maxLength={36} value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></Field>
      {(relationType === 'fork_of' || relationType === 'successor_of') && <Field label={t('resourceWorkbenchV2.community.targetVersionUuid')}><input className={inputClass()} required maxLength={36} value={targetVersionId} onChange={(event) => setTargetVersionId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></Field>}
      {relationType === 'recommended_for' && <Field label={t('resourceWorkbenchV2.community.relationContext')}><select className={inputClass()} value={context} onChange={(event) => setContext(event.target.value as typeof context)}>{(['opening', 'production', 'defense', 'logistics', 'general'] as const).map((item) => <option key={item} value={item}>{t(`resourceWorkbenchV2.community.context.${item}`)}</option>)}</select></Field>}
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
