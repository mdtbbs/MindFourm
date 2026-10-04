'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import {
  updateResourceWorkbenchV2,
  type ResourceWorkbenchV2ResourcePatch,
  type ResourceWorkbenchV2Response,
} from '@/lib/api/v1/resources';

export default function ResourceProfileEditor({
  workbench,
  canEdit,
  onSaved,
}: {
  workbench: ResourceWorkbenchV2Response;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const resource = workbench.resource;
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description || '');
  const [content, setContent] = useState(resource.content_text || resource.content || '');
  const [sourceUrl, setSourceUrl] = useState(resource.source_url || '');
  const [license, setLicense] = useState(resource.license || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTitle(resource.title);
    setDescription(resource.description || '');
    setContent(resource.content_text || resource.content || '');
    setSourceUrl(resource.source_url || '');
    setLicense(resource.license || '');
  }, [resource.content, resource.content_text, resource.description, resource.license, resource.source_url, resource.title]);

  const original = useMemo(() => ({
    title: resource.title,
    description: resource.description || '',
    content: resource.content_text || resource.content || '',
    source_url: resource.source_url || '',
    license: resource.license || '',
  }), [resource.content, resource.content_text, resource.description, resource.license, resource.source_url, resource.title]);
  const current = { title, description, content, source_url: sourceUrl, license };
  const changed = Object.keys(current).some((key) => current[key as keyof typeof current] !== original[key as keyof typeof original]);
  const sourceChanged = sourceUrl !== original.source_url || license !== original.license;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !changed || !title.trim()) return;
    const input: ResourceWorkbenchV2ResourcePatch = {};
    if (title !== original.title) input.title = title.trim();
    if (description !== original.description) input.description = description;
    if (content !== original.content) input.content = content;
    if (sourceUrl !== original.source_url) input.source_url = sourceUrl.trim();
    if (license !== original.license) input.license = license.trim();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateResourceWorkbenchV2(resource.public_id, input);
      setSaved(true);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('resourceWorkbenchV2.profileSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = `mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text)] ${canEdit ? '' : 'opacity-75'}`;
  return <form onSubmit={submit} className="space-y-4">
    {!canEdit && <p className="rounded-lg bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-muted)]">{t('resourceWorkbenchV2.profileReadOnly')}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.title')}<input className={fieldClass} value={title} maxLength={200} disabled={!canEdit || saving} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} /></label>
      <label className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceWorkbenchV2.sourceUrl')}<input className={fieldClass} type="url" value={sourceUrl} maxLength={2_000} disabled={!canEdit || saving} onChange={(event) => { setSourceUrl(event.target.value); setSaved(false); }} placeholder="https://…" /></label>
      <label className="text-sm font-medium text-[var(--text-secondary)] sm:col-span-2">{t('resourceWorkbenchV2.shortDescription')}<textarea className={`${fieldClass} min-h-24`} value={description} maxLength={2_000} disabled={!canEdit || saving} onChange={(event) => { setDescription(event.target.value); setSaved(false); }} /></label>
      <label className="text-sm font-medium text-[var(--text-secondary)] sm:col-span-2">{t('resourceWorkbenchV2.detailedDescription')}<textarea className={`${fieldClass} min-h-40`} value={content} maxLength={100_000} disabled={!canEdit || saving} onChange={(event) => { setContent(event.target.value); setSaved(false); }} /></label>
      <label className="text-sm font-medium text-[var(--text-secondary)] sm:col-span-2">{t('resourceWorkbenchV2.license')}<input className={fieldClass} value={license} maxLength={191} disabled={!canEdit || saving} onChange={(event) => { setLicense(event.target.value); setSaved(false); }} placeholder={t('resourceWorkbenchV2.licensePlaceholder')} /></label>
    </div>
    {sourceChanged && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-[var(--text-secondary)]">{t('resourceWorkbenchV2.sourceReviewNotice')}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {saved && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{t('resourceWorkbenchV2.profileSaved')}</p>}
    <button type="submit" disabled={!canEdit || !changed || !title.trim() || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? t('resourceWorkbenchV2.saving') : t('resourceWorkbenchV2.saveProfile')}</button>
  </form>;
}
