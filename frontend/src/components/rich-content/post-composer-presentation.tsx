'use client';

import { useId, useState, type ReactNode, type KeyboardEvent } from 'react';
import RichContentRenderer from '@/components/ui/rich-content-renderer';
import { RichContentShell } from './rich-content-shell';
import { useI18n } from '@/i18n/provider';

/** Preview only reads current JSON. Hidden editing panels stay mounted with their
 * ProseMirror selection, history, uploads and draft state intact.
 */
export function PostComposerPresentation({ title, json, markdown, children }: {
  title: string; json: Record<string, unknown> | null; markdown: string; children: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  const [preview, setPreview] = useState(false);
  const selectTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? false : event.key === 'End' ? true : !preview;
    setPreview(next);
    document.getElementById(`${id}-${next ? 'preview' : 'edit'}-tab`)?.focus();
  };
  return <>
    <div className="rich-composer-tabs" role="tablist" aria-label={t('richPresentation.mode')}>
      {[false, true].map((mode) => <button key={String(mode)} id={`${id}-${mode ? 'preview' : 'edit'}-tab`} type="button" role="tab" aria-selected={preview === mode} aria-controls={`${id}-${mode ? 'preview' : 'edit'}-panel`} tabIndex={preview === mode ? 0 : -1} onKeyDown={selectTab} onClick={() => setPreview(mode)} data-testid={mode ? 'post-preview-tab' : 'post-editor-tab'}>{t(mode ? 'richPresentation.preview' : 'richPresentation.edit')}</button>)}
    </div>
    <div id={`${id}-edit-panel`} role="tabpanel" aria-labelledby={`${id}-edit-tab`} hidden={preview} className="space-y-5">{children}</div>
    <article id={`${id}-preview-panel`} role="tabpanel" aria-labelledby={`${id}-preview-tab`} hidden={!preview} className="rich-post-preview" data-testid="post-preview">
      <RichContentShell>
        <h1 className="rich-post-title">{title || t('richPresentation.untitled')}</h1>
        {preview && <RichContentRenderer json={json} markdownFallback={markdown} />}
      </RichContentShell>
    </article>
  </>;
}
