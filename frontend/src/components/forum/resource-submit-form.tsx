'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ClipboardPaste, ExternalLink, Loader2, Map, Upload } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { ResourceCategory } from '@/types';
import { RESOURCE_KINDS } from '@/lib/display-labels';
import { useToastStore } from '@/store/toast-store';
import { DraftSnapshot, useDraft, useDraftAutoSave } from '@/hooks/use-draft';
import DraftRecovery from '@/components/ui/draft-recovery';
import { useI18n } from '@/i18n/provider';
import ContentLanguageSelect from '@/components/forum/content-language-select';

type ResourceType = 'upload' | 'external';
type SchematicSource = 'file' | 'paste';

const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => null,
});

export default function ResourceSubmitForm() {
  const { t } = useI18n();
  const router = useRouter();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [resourceType, setResourceType] = useState<ResourceType | null>(null);
  const [resourceKind, setResourceKind] = useState('other');
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [contentLanguage, setContentLanguage] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [content, setContent] = useState('');
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [schematicSource, setSchematicSource] = useState<SchematicSource>('file');
  const [schematicCode, setSchematicCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingFileDuplicates, setCheckingFileDuplicates] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<{ exact: boolean; existing_resources: Array<{ id: number | null; title: string; url: string }>; similar_resources?: Array<{ id: number | null; title: string; url: string }> } | null>(null);
  const submissionKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const fileHash = useRef<{ file: File; hash: string } | null>(null);
  const duplicateCheckSequence = useRef(0);
  const [recoverableDraft, setRecoverableDraft] = useState<DraftSnapshot | null>(null);
  const draft = useDraft('resource');
  const saveDraft = draft.save;
  const draftValues = useMemo(
    () => ({ resourceType, resourceKind, title, version, description, contentLanguage, categoryId, isPublic, content, contentJson, externalUrl, schematicSource, schematicCode }),
    [resourceType, resourceKind, title, version, description, contentLanguage, categoryId, isPublic, content, contentJson, externalUrl, schematicSource, schematicCode],
  );
  const hasDraftContent = Boolean(resourceType || title || version || description || content || externalUrl || schematicCode);
  useDraftAutoSave(draftValues, draft.save, hasDraftContent && !isSubmitting);

  useEffect(() => {
    resourceApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setRecoverableDraft(draft.load());
  // A draft is checked exactly once when this new-resource form mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = () => {
    const saved = recoverableDraft?.values;
    if (!saved) return;
    if (saved.resourceType === 'upload' || saved.resourceType === 'external') setResourceType(saved.resourceType);
    if (typeof saved.resourceKind === 'string') setResourceKind(saved.resourceKind);
    if (typeof saved.title === 'string') setTitle(saved.title);
    if (typeof saved.version === 'string') setVersion(saved.version);
    if (typeof saved.description === 'string') setDescription(saved.description);
    if (typeof saved.contentLanguage === 'string') setContentLanguage(saved.contentLanguage);
    if (typeof saved.categoryId === 'number') setCategoryId(saved.categoryId);
    if (typeof saved.isPublic === 'boolean') setIsPublic(saved.isPublic);
    if (typeof saved.content === 'string') setContent(saved.content);
    if (saved.contentJson && typeof saved.contentJson === 'object') setContentJson(saved.contentJson as Record<string, unknown>);
    if (typeof saved.externalUrl === 'string') setExternalUrl(saved.externalUrl);
    if (saved.schematicSource === 'file' || saved.schematicSource === 'paste') setSchematicSource(saved.schematicSource);
    if (typeof saved.schematicCode === 'string') setSchematicCode(saved.schematicCode);
    setRecoverableDraft(null);
  };

  const discardDraft = () => {
    draft.clear();
    setRecoverableDraft(null);
  };

  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!hasDraftContent || isSubmitting) return;
      saveDraft(draftValues);
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [saveDraft, draftValues, hasDraftContent, isSubmitting]);

  useEffect(() => {
    if (hasDraftContent && recoverableDraft) setRecoverableDraft(null);
  }, [hasDraftContent, recoverableDraft]);

  const isMap = resourceKind === 'map';
  const isSchematic = resourceKind === 'schematic';
  const isForumManagedKind = isMap || isSchematic;

  useEffect(() => {
    if (isForumManagedKind && resourceType !== 'upload') setResourceType('upload');
  }, [isForumManagedKind, resourceType]);

  const checkSelectedFile = async (selectedFile: File | null) => {
    const sequence = ++duplicateCheckSequence.current;
    fileHash.current = null;
    setDuplicateNotice(null);
    setError(null);
    if (!selectedFile) {
      setCheckingFileDuplicates(false);
      return;
    }
    setCheckingFileDuplicates(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', await selectedFile.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (sequence !== duplicateCheckSequence.current) return;
      fileHash.current = { file: selectedFile, hash };
      const duplicate = await resourceApi.checkDuplicate({ content_hash: hash, resource_kind: resourceKind, title: title.trim() });
      if (sequence !== duplicateCheckSequence.current) return;
      setDuplicateNotice(duplicate);
      if (duplicate.exact) setError(t('resourceSubmit.duplicateExact'));
    } catch (cause) {
      if (sequence === duplicateCheckSequence.current) setError(cause instanceof Error ? cause.message : t('resourceSubmit.duplicateCheckFailed'));
    } finally {
      if (sequence === duplicateCheckSequence.current) setCheckingFileDuplicates(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resourceType) {
      setError(t('resourceSubmit.chooseType'));
      return;
    }

    if (!title.trim()) {
      setError(t('resourceSubmit.enterTitle'));
      return;
    }

    if (!version.trim()) {
      setError(t('resourceSubmit.enterVersion'));
      return;
    }

    if (isSchematic && schematicSource === 'paste' && !schematicCode.trim()) {
      setError(t('resourceSubmit.pasteSchematic'));
      return;
    }

    if (resourceType === 'upload' && (!file && !(isSchematic && schematicSource === 'paste'))) {
      setError(t('resourceSubmit.chooseFile'));
      return;
    }

    if (resourceType === 'external' && !externalUrl.trim()) {
      setError(t('resourceSubmit.enterExternalUrl'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('resource_type', resourceType);
      formData.append('resource_kind', resourceKind);
      formData.append('content_language', contentLanguage || 'unknown');

      formData.append('version', version.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (categoryId) formData.append('category_id', String(categoryId));
      formData.append('is_public', isPublic ? '1' : '0');
      if (content.trim()) formData.append('content', content.trim());
      if (contentJson) {
        formData.append('content_json', JSON.stringify(contentJson));
        formData.append('content_schema_version', '2');
      }

      if (isSchematic && schematicSource === 'paste') {
        formData.append('schematic_code', schematicCode.trim());
      } else if (resourceType === 'external') {
        formData.append('external_url', externalUrl.trim());
      } else if (file) {
        formData.append('file', file);
      }

      let contentHash: string | undefined;
      if (file) {
        if (fileHash.current?.file === file) contentHash = fileHash.current.hash;
        else {
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          contentHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        }
      }
      const duplicate = await resourceApi.checkDuplicate({
        ...(contentHash ? { content_hash: contentHash } : {}),
        resource_kind: resourceKind,
        ...(resourceType === 'external' ? { source_url: externalUrl.trim() } : {}),
        title: title.trim(),
      });
      setDuplicateNotice(duplicate);
      if (duplicate.exact) {
        setError(t('resourceSubmit.duplicateDetected'));
        return;
      }
      const fingerprint = JSON.stringify({ contentHash, resourceKind, resourceType, title: title.trim(), version: version.trim(), externalUrl: externalUrl.trim(), description: description.trim(), contentLanguage, categoryId, isPublic });
      if (!submissionKey.current || submissionKey.current.fingerprint !== fingerprint) {
        submissionKey.current = { fingerprint, key: crypto.randomUUID() };
      }

      const resource = await resourceApi.upload(formData, submissionKey.current.key);
      draft.clear();
      showSuccess(t('resourceSubmit.success'));
      router.push(`/resources/${resource.id}`);
    } catch (err) {
      const existingResource = (err as { existingResource?: { id: number | null; title: string; url: string } | null }).existingResource;
      if (existingResource) setDuplicateNotice({ exact: true, existing_resources: [existingResource] });
      setError(err instanceof Error ? err.message : t('resourceSubmit.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-6"
    >
      {recoverableDraft && (
        <DraftRecovery
          savedAt={recoverableDraft.timestamp}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
        />
      )}
      {draft.saveError && (
        <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {draft.saveError}
        </div>
      )}
      {error && (
        <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {duplicateNotice && (duplicateNotice.exact || duplicateNotice.similar_resources?.length) && <div className={`rounded-[var(--radius)] border p-3 text-sm ${duplicateNotice.exact ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]'}`}>
        <p className="font-medium">{duplicateNotice.exact ? t('resourceSubmit.exactFound') : t('resourceSubmit.similarFound')}</p>
        <ul className="mt-2 space-y-1">{[...duplicateNotice.existing_resources, ...(duplicateNotice.similar_resources || [])].map((item) => <li key={`${item.id}-${item.title}`}><a className="underline underline-offset-2" href={item.url || `/resources/${item.id}`} target="_blank" rel="noreferrer">{item.title} · #{item.id}</a></li>)}</ul>
      </div>}

      {!isForumManagedKind ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--text-secondary)]">{t('resourceSubmit.typeRequired')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
          <label
            data-testid="resource-type-upload"
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              resourceType === 'upload'
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] bg-[var(--bg-elevated)]'
            }`}
          >
            <input
              type="radio"
              name="resourceType"
              value="upload"
              checked={resourceType === 'upload'}
              onChange={() => setResourceType('upload')}
              className="sr-only"
            />
            <div className="flex items-start gap-3">
              <Upload className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">{t('resourceSubmit.file')}</div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {t('resourceSubmit.fileDescription')}
                </p>
              </div>
            </div>
          </label>

          <label
            data-testid="resource-type-external"
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              resourceType === 'external'
                ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                : 'border-[var(--border)] bg-[var(--bg-elevated)]'
            }`}
          >
            <input
              type="radio"
              name="resourceType"
              value="external"
              checked={resourceType === 'external'}
              onChange={() => setResourceType('external')}
              className="sr-only"
            />
            <div className="flex items-start gap-3">
              <ExternalLink className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">{t('resourceSubmit.external')}</div>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {t('resourceSubmit.externalDescription')}
                </p>
              </div>
            </div>
          </label>
          </div>
        </div>
      ) : (
        <div
          data-testid="resource-managed-kind-notice"
          className="rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4"
        >
          <div className="flex items-start gap-3">
            <Map className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{isMap ? t('resourceSubmit.mapSubmit') : t('resourceSubmit.schematicSubmit')}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                {isMap
                  ? t('resourceSubmit.mapDescription')
                  : t('resourceSubmit.schematicDescription')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">{t('resourceSubmit.kindRequired')}</label>
        <select
          value={resourceKind}
          onChange={(event) => {
            const nextKind = event.target.value;
            if (nextKind === 'map' || nextKind === 'schematic') {
              router.push(`/resources/submit/${nextKind}`);
              return;
            }
            setResourceKind(nextKind);
            setFile(null);
            setSchematicCode('');
            setSchematicSource('file');
            if (nextKind === 'map' || nextKind === 'schematic') setResourceType('upload');
          }}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)]"
        >
          {RESOURCE_KINDS.map(({ value, label }) => {
            const translatedKey = `resourceList.resourceKind.${value}`;
            const translatedLabel = t(translatedKey);
            const kindName = translatedLabel === translatedKey ? label : translatedLabel;
            return <option key={value} value={value}>{value === 'map' || value === 'schematic' ? `${kindName} (${t('resourceSubmit.dedicatedWorkspace')})` : kindName}</option>;
          })}
        </select>
        {(resourceKind === 'map' || resourceKind === 'schematic') && <p className="text-xs text-[var(--text-muted)]">{resourceKind === 'map' ? t('resourceSubmit.mapOnly') : t('resourceSubmit.schematicOnly')}</p>}
      </div>

      <Input
        data-testid="resource-title-input"
        label={t('resourceSubmit.titleLabel')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('resourceSubmit.titlePlaceholder')}
        required
        maxLength={200}
      />

      <Input
        data-testid="resource-version-input"
        label={t('resourceSubmit.versionLabel')}
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder={t('resourceSubmit.versionPlaceholder')}
        maxLength={50}
      />

      <ContentLanguageSelect value={contentLanguage} onChange={setContentLanguage} content={`${title}\n${description}\n${content}`} />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">{t('resourceSubmit.shortDescription')}</label>
        <textarea
          data-testid="resource-description-input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-label={t('resourceSubmit.shortDescriptionAria')}
          placeholder={t('resourceSubmit.shortDescriptionPlaceholder')}
          maxLength={300}
          rows={3}
          className="w-full resize-y rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm leading-6 text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        />
        <p className="text-right text-xs text-[var(--text-muted)]">{description.length}/300</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">{t('resourceSubmit.topic')}</label>
        <select
          data-testid="resource-category-select"
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)]"
        >
          <option value="">{t('resourceSubmit.none')}</option>
          {categories
            .filter((category) => category.is_active)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t('resourceSubmit.topicHelp')}</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">{t('resourceSubmit.longDescription')}</label>
        <TiptapEditor
          value={content}
          onChange={setContent}
          jsonValue={contentJson}
          onJsonChange={setContentJson}
          context="resource"
          ariaLabel={t('resourceSubmit.resourceBody')}
          placeholder={t('resourceSubmit.longDescriptionPlaceholder')}
          minHeight="260px"
          imageUpload
          testId="resource-content-input"
        />
      </div>

      {resourceType === 'external' && (
        <Input
          data-testid="resource-external-url-input"
          label={t('resourceSubmit.externalUrl')}
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder={t('resourceSubmit.externalUrlPlaceholder')}
          required
          type="url"
        />
      )}

      {isSchematic && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <p className="text-sm font-medium text-[var(--text)]">{t('resourceSubmit.schematicSource')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-testid="schematic-source-file"
              onClick={() => { setSchematicSource('file'); setSchematicCode(''); }}
              className={`rounded-lg border px-3 py-3 text-left text-sm ${schematicSource === 'file' ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]'}`}
            >
              <Upload className="mb-1 h-4 w-4 text-[var(--primary)]" />
              {t('resourceSubmit.uploadSchematic')}
            </button>
            <button
              type="button"
              data-testid="schematic-source-paste"
              onClick={() => { setSchematicSource('paste'); setFile(null); }}
              className={`rounded-lg border px-3 py-3 text-left text-sm ${schematicSource === 'paste' ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]'}`}
            >
              <ClipboardPaste className="mb-1 h-4 w-4 text-[var(--primary)]" />
              {t('resourceSubmit.pasteSchematicLabel')}
            </button>
          </div>
          {schematicSource === 'paste' && (
            <div className="space-y-2">
              <textarea
                data-testid="schematic-code-input"
                value={schematicCode}
                onChange={(event) => setSchematicCode(event.target.value)}
                className="min-h-36 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3 font-mono text-xs text-[var(--text)]"
                placeholder={t('resourceSubmit.schematicCodePlaceholder')}
                spellCheck={false}
              />
              <p className="text-xs text-[var(--text-muted)]">{t('resourceSubmit.schematicCodeHelp')}</p>
            </div>
          )}
        </div>
      )}

      {resourceType === 'upload' && (!isSchematic || schematicSource === 'file') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">{isMap ? t('resourceSubmit.mapFile') : isSchematic ? t('resourceSubmit.schematicFile') : t('resourceSubmit.fileRequired')}</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border-2 border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
            <Upload className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="flex-1 truncate text-sm text-[var(--text)]">
              {file?.name || (isMap ? t('resourceSubmit.chooseMapFile') : isSchematic ? t('resourceSubmit.chooseSchematicFile') : t('resourceSubmit.chooseUploadFile'))}
            </span>
            <input
              data-testid="resource-file-input"
              type="file"
              accept={resourceKind === 'map' ? '.msav' : resourceKind === 'schematic' ? '.msch' : '.zip,.rar,.7z,.tar,.gz,.jar,.msav,.msch,.json,.hjson,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif'}
              onChange={(e) => { const selectedFile = e.target.files?.[0] || null; setFile(selectedFile); void checkSelectedFile(selectedFile); }}
              className="hidden"
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t('resourceSubmit.maxFileSize')}</p>

        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">{t('resourceSubmit.visibility')}</label>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
            <span className="text-sm">{t('resourceSubmit.public')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <span className="text-sm">{t('resourceSubmit.private')}</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => { if (hasDraftContent) draft.save(draftValues); router.back(); }}
          className="rounded-[var(--radius)] bg-[var(--bg-elevated)] px-4 py-2 text-sm hover:bg-[var(--bg-card)]"
        >
          {t('resourceSubmit.cancel')}
        </button>
        <button
          data-testid="resource-submit-button"
          type="submit"
          disabled={isSubmitting || checkingFileDuplicates || Boolean(duplicateNotice?.exact)}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {resourceType === 'external' ? <ExternalLink className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          {checkingFileDuplicates ? t('resourceSubmit.checkingFile') : isSubmitting ? t('resourceSubmit.submitting') : t('resourceSubmit.submit')}
        </button>
        {draft.lastSavedAt && hasDraftContent && (
          <span className="self-center text-xs text-[var(--text-muted)]">{t('resourceSubmit.savedToDevice')}</span>
        )}
      </div>
    </form>
  );
}
