'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/provider';
import { useAuth } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';
import {
  analyzeSchematicPaste,
  fetchResourceCategories,
  publishSchematicAsResource,
  type ResourceCategoryOption,
  type SchematicPasteAnalysis,
} from '@/lib/api/v1/resource-embeds';
import { schematicPasteFile, type ParsedSchematicPaste } from '@/lib/tiptap/resource-embed';

export type ResourceEmbedPasteDialogProps = {
  paste: ParsedSchematicPaste | null;
  onClose: () => void;
  /** Checked before an upload so a full document does not create a stray resource. */
  canInsertCard: () => boolean;
  onInsertCard: (attrs: {
    resourcePublicId: string;
    versionPublicId: string | null;
    displayMode: 'card';
  }) => boolean;
  /** Inserts the raw clipboard text as a plain code block and closes the panel. */
  onKeepPlainText: () => void;
};

type AnalysisState = 'idle' | 'loading' | 'ready' | 'error';
type PublishStage = 'idle' | 'creating' | 'uploading' | 'inserting';

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

function safePreviewDataUrl(value: string | null): string | null {
  if (!value) return null;
  return /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(value) && value.length <= 8_000_000
    ? value
    : null;
}

type MaterialEntry = { name: string; amount: number; displayName: string | null };

function materialEntries(analysis: SchematicPasteAnalysis | null): MaterialEntry[] {
  const raw = analysis?.metadata?.requirements;
  if (!Array.isArray(raw)) return [];
  const entries: MaterialEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.item === 'string'
      ? record.item
      : typeof record.internal_name === 'string'
        ? record.internal_name
        : typeof record.name === 'string' ? record.name : null;
    const amount = numberValue(record.amount);
    if (!name || amount === null) continue;
    entries.push({
      name,
      amount,
      displayName: typeof record.display_name === 'string' ? record.display_name : null,
    });
  }
  return entries.sort((left, right) => right.amount - left.amount).slice(0, 4);
}

/**
 * Non-blocking publish panel for a pasted blueprint.
 *
 * Closing the panel never discards the clipboard: Esc, the close button,
 * "cancel" and "keep as plain text" all insert the original Base64 into a plain
 * code block through the caller. The custom node is only created after a
 * successful publish.
 */
export function ResourceEmbedPasteDialog({
  paste,
  onClose,
  canInsertCard,
  onInsertCard,
  onKeepPlainText,
}: ResourceEmbedPasteDialogProps) {
  const { t, locale } = useI18n();
  const { isAuthenticated } = useAuth();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const headingId = useId();
  const [analysis, setAnalysis] = useState<SchematicPasteAnalysis | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisKey, setAnalysisKey] = useState(0);
  const [categories, setCategories] = useState<ResourceCategoryOption[]>([]);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('1.0');
  const [categoryId, setCategoryId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [stage, setStage] = useState<PublishStage>('idle');
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const analysisAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      analysisAbortRef.current?.abort();
    };
  }, []);

  // A new paste starts with a clean form; the analysis effect below owns the parse.
  useEffect(() => {
    if (!paste) return;
    setTitle('');
    setVersion('1.0');
    setCategoryId('');
    setError('');
    setStage('idle');
    setAnalysis(null);
    setAnalysisState('idle');
    setAnalysisError('');
  }, [paste]);

  useEffect(() => {
    if (!paste) return;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setAnalysisState('loading');
    setAnalysisError('');
    analyzeSchematicPaste(paste.bytes, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setAnalysis(result);
        setAnalysisState('ready');
        const parsedName = result.metadata && typeof result.metadata.name === 'string' ? result.metadata.name.trim() : '';
        if (parsedName) setTitle((current) => current || parsedName.slice(0, 120));
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        // A network TypeError says nothing useful to the reader; use our copy.
        const message = failure instanceof TypeError ? '' : failure instanceof Error ? failure.message : '';
        setAnalysisState('error');
        setAnalysisError(!message || message === 'RESOURCE_EMBED_ANALYZE_FAILED'
          ? t('resourceEmbed.paste.analyzeFailed')
          : message);
      });
    return () => controller.abort();
  }, [analysisKey, paste, t]);

  useEffect(() => {
    if (!paste) return;
    const controller = new AbortController();
    fetchResourceCategories(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setCategories(items);
      })
      .catch(() => {
        // Categories are optional: publishing with none is a supported path.
        if (!controller.signal.aborted) setCategories([]);
      });
    return () => controller.abort();
  }, [paste]);

  const keepPlainText = useCallback(() => {
    if (publishing) return;
    onKeepPlainText();
    onClose();
  }, [onClose, onKeepPlainText, publishing]);

  useEffect(() => {
    if (!paste) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || publishing) return;
      event.preventDefault();
      keepPlainText();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [keepPlainText, paste, publishing]);

  if (!paste) return null;

  const metadata = analysis?.metadata ?? null;
  const width = numberValue(metadata?.width);
  const height = numberValue(metadata?.height);
  const blockCount = numberValue(metadata?.block_count)
    ?? numberValue(metadata?.blocks)
    ?? (analysis ? analysis.blocks.reduce((sum, block) => sum + block.count, 0) : null);
  const materials = materialEntries(analysis);
  const previewUrl = safePreviewDataUrl(analysis?.preview_data_url ?? null);
  const stageLabel = stage === 'creating'
    ? t('resourceEmbed.paste.creatingDraft')
    : stage === 'uploading'
      ? t('resourceEmbed.paste.uploading')
      : stage === 'inserting'
        ? t('resourceEmbed.paste.inserting')
        : t('resourceEmbed.paste.publishing');

  const publish = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 120) {
      setError(t('resourceEmbed.paste.titleRequired'));
      return;
    }
    if (!isAuthenticated) {
      setError(t('resourceEmbed.paste.signInRequired'));
      return;
    }
    if (!analysis || analysisState !== 'ready') {
      setError(t('resourceEmbed.paste.analyzeFailed'));
      return;
    }
    if (!canInsertCard()) {
      setError(t('resourceEmbed.paste.tooManyCards'));
      return;
    }
    setPublishing(true);
    setError('');
    setStage('creating');
    try {
      const published = await publishSchematicAsResource({
        file: schematicPasteFile(paste),
        title: cleanTitle,
        version,
        categoryId: categoryId ? Number(categoryId) : null,
        onStage: (next) => {
          if (mountedRef.current) setStage(next);
        },
      });
      if (mountedRef.current) setStage('inserting');
      if (!canInsertCard()) {
        if (mountedRef.current) setError(t('resourceEmbed.paste.tooManyCards'));
        return;
      }
      const inserted = onInsertCard({
        resourcePublicId: published.resourcePublicId,
        versionPublicId: published.versionPublicId,
        displayMode: 'card',
      });
      if (!inserted) {
        if (mountedRef.current) setError(t('resourceEmbed.paste.insertFailed'));
        return;
      }
      showSuccess(t('resourceEmbed.paste.published'));
      if (mountedRef.current) {
        setPublishing(false);
        setStage('idle');
      }
      onClose();
    } catch (failure) {
      if (mountedRef.current) {
        const message = failure instanceof TypeError ? '' : failure instanceof Error ? failure.message : '';
        setError(message || t('resourceEmbed.paste.publishFailed'));
      }
    } finally {
      if (mountedRef.current) {
        setPublishing(false);
        setStage('idle');
      }
    }
  };

  const disabled = publishing || !isAuthenticated || analysisState !== 'ready' || !title.trim();

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      data-testid="resource-embed-paste-dialog"
      className="fixed inset-x-3 bottom-3 z-[130] max-h-[min(85dvh,42rem)] overflow-y-auto border border-[var(--border)] bg-[var(--bg-card)] p-4 text-[var(--text)] shadow-2xl sm:left-auto sm:right-4 sm:w-[28rem]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold">{t('resourceEmbed.paste.title')}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('resourceEmbed.paste.description')}</p>
        </div>
        <button
          type="button"
          aria-label={t('resourceEmbed.paste.close')}
          title={t('resourceEmbed.paste.close')}
          disabled={publishing}
          onClick={keepPlainText}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {analysisState === 'loading' && (
        <p className="mt-4 flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('resourceEmbed.paste.analyzing')}
        </p>
      )}

      {analysisState === 'error' && (
        <div className="mt-4 border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm" role="alert">
          <p>{analysisError || t('resourceEmbed.paste.analyzeFailed')}</p>
          <button
            type="button"
            onClick={() => setAnalysisKey((value) => value + 1)}
            disabled={publishing}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 border border-[var(--border)] px-3 text-sm hover:border-[var(--primary)] hover:text-[var(--primary-text)] disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('resourceEmbed.paste.retryAnalysis')}
          </button>
        </div>
      )}

      {analysisState === 'ready' && analysis && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-3">
            {previewUrl
              ? <img src={previewUrl} alt={t('resourceEmbed.paste.previewAlt')} className="h-28 w-32 shrink-0 border border-[var(--border)] bg-[var(--bg-elevated)] object-contain" />
              : <div className="flex h-28 w-32 shrink-0 items-center justify-center border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">{t('resourceEmbed.paste.previewUnavailable')}</div>}
            <dl className="min-w-0 flex-1 space-y-1 text-sm text-[var(--text-secondary)]">
              {width !== null && height !== null && (
                <div><dt className="inline text-[var(--text-muted)]">{t('resourceEmbed.paste.dimensionsLabel')}: </dt><dd className="inline">{width} × {height}</dd></div>
              )}
              {blockCount !== null && (
                <div><dt className="inline text-[var(--text-muted)]">{t('resourceEmbed.paste.blocksLabel')}: </dt><dd className="inline">{formatNumber(blockCount, locale)}</dd></div>
              )}
              <div><dt className="inline text-[var(--text-muted)]">{t('resourceEmbed.paste.codeLengthLabel')}: </dt><dd className="inline">{formatNumber(paste.raw.length, locale)}</dd></div>
            </dl>
          </div>

          {materials.length > 0 && (
            <div className="text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">{t('resourceEmbed.paste.materials')}:</span>{' '}
              {materials.map((material, index) => (
                <span key={`${material.name}-${index}`}>
                  {index > 0 ? ' · ' : ''}
                  {t('resourceEmbed.paste.materialAmount', {
                    name: material.displayName || material.name,
                    amount: formatNumber(material.amount, locale),
                  })}
                </span>
              ))}
            </div>
          )}

          {!isAuthenticated && (
            <p className="border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-secondary)]" role="note">
              {t('resourceEmbed.paste.signInRequired')}{' '}
              <a href="/login" className="text-[var(--primary-text)] underline">{t('resourceEmbed.paste.signIn')}</a>
            </p>
          )}

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">{t('resourceEmbed.paste.titleLabel')}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                required
                placeholder={t('resourceEmbed.paste.titlePlaceholder')}
                className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-secondary)]">{t('resourceEmbed.paste.versionLabel')}</span>
                <input
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  maxLength={64}
                  className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-secondary)]">{t('resourceEmbed.paste.categoryLabel')}</span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="min-h-11 w-full border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                >
                  <option value="">{t('resourceEmbed.paste.categoryNone')}</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-3 border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--danger,#dc2626)]" role="alert">{error}</p>}

      {publishing && (
        <p className="mt-3 flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {stageLabel}
        </p>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="min-h-11" disabled={publishing} onClick={keepPlainText}>
          {t('resourceEmbed.paste.keepPlainText')}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={publishing} onClick={keepPlainText}>
          {t('resourceEmbed.paste.cancel')}
        </Button>
        <Button type="button" className="min-h-11" disabled={disabled} onClick={() => { void publish(); }}>
          {publishing ? stageLabel : t('resourceEmbed.paste.publish')}
        </Button>
      </div>
    </section>
  );
}

export default ResourceEmbedPasteDialog;
