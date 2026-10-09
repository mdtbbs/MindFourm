'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { Input } from '@/components/ui/input';
import { Resource, ResourceCategory } from '@/types';
import { useToastStore } from '@/store/toast-store';
import ContentLanguageSelect from '@/components/forum/content-language-select';
import { useI18n } from '@/i18n/provider';

function ResourceEditorLoading() {
  const { t } = useI18n();
  return (
    <div role="status" className="flex min-h-[160px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
      <span className="ml-2 text-xs text-[var(--text-muted)]">{t('resourceEdit.editorLoading')}</span>
    </div>
  );
}

const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: ResourceEditorLoading,
});

interface ResourceEditFormProps {
  resource: Resource;
}

export default function ResourceEditForm({ resource }: ResourceEditFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [title, setTitle] = useState(resource.title || '');
  const [version, setVersion] = useState(resource.version || '');
  const [description, setDescription] = useState(resource.description || '');
  const [categoryId, setCategoryId] = useState<number | null>(resource.category_id || null);
  const [isPublic, setIsPublic] = useState(resource.is_public !== false);
  const [content, setContent] = useState(resource.content || '');
  const [contentLanguage, setContentLanguage] = useState(resource.content_language === 'unknown' ? '' : resource.content_language || '');
  const [contentJson, setContentJson] = useState<Record<string, unknown> | null>(resource.content_json || null);
  const [externalUrl, setExternalUrl] = useState(resource.external_url || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resourceApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError(t('resourceEdit.titleRequired'));
      return;
    }

    if (resource.resource_type === 'external' && !externalUrl.trim()) {
      setError(t('resourceEdit.externalUrlRequired'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const updateData: Partial<Resource> = {
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        is_public: isPublic,
        content: content.trim() || null,
        content_language: contentLanguage || 'unknown',
        content_json: contentJson,
        content_schema_version: contentJson ? 2 : undefined,
      };

      if (version.trim()) {
        updateData.version = version.trim();
      }

      if (resource.resource_type === 'external') {
        updateData.external_url = externalUrl.trim();
      }

      await resourceApi.update(resource.id, updateData);
      showSuccess(t('resourceEdit.updated'));
      router.push(`/resources/${resource.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resourceEdit.updateFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-6"
    >
      {error && (
        <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <Input
        label={t('resourceEdit.titleLabel')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('resourceEdit.titlePlaceholder')}
        required
        maxLength={200}
      />

      <Input
        label={t('resourceEdit.version')}
        value={version}
        onChange={(e) => setVersion(e.target.value)}
        placeholder={t('resourceEdit.versionPlaceholder')}
        maxLength={50}
      />

      <ContentLanguageSelect value={contentLanguage} onChange={setContentLanguage} content={`${title}\n${description}\n${content}`} />

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">{t('resourceEdit.shortDescription')}</label>
        <TiptapEditor
          value={description}
          onChange={setDescription}
          ariaLabel={t('resourceEdit.shortDescription')}
          placeholder={t('resourceEdit.shortDescriptionPlaceholder')}
          minHeight="120px"
          compact
          imageUpload
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">{t('resourceEdit.topic')}</label>
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)]"
        >
          <option value="">{t('resourceEdit.noTopic')}</option>
          {categories
            .filter((category) => category.is_active)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">{t('resourceEdit.description')}</label>
        <TiptapEditor
          value={content}
          onChange={setContent}
          jsonValue={contentJson}
          onJsonChange={setContentJson}
          context="resource"
          ariaLabel={t('resourceEdit.description')}
          placeholder={t('resourceEdit.descriptionPlaceholder')}
          minHeight="260px"
          imageUpload
        />
      </div>

      {resource.resource_type === 'external' && (
        <Input
          label={t('resourceEdit.externalUrlLabel')}
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder={t('resourceEdit.externalUrlPlaceholder')}
          required
          type="url"
        />
      )}

      {resource.resource_type === 'upload' && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <p className="text-sm text-[var(--text-muted)]">
            {t('resourceEdit.fileImmutable')}
          </p>
          {resource.file_name && (
            <p className="mt-2 text-sm text-[var(--text)]">
              {t('resourceEdit.currentFile')}: <span className="font-medium">{resource.file_name}</span>
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">{t('resourceEdit.visibility')}</label>
        <div className="flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
            <span className="text-sm">{t('resourceEdit.public')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <span className="text-sm">{t('resourceEdit.private')}</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-[var(--radius)] bg-[var(--bg-elevated)] px-4 py-2 text-sm hover:bg-[var(--bg-card)]"
        >
          {t('resourceEdit.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary-button)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? t('resourceEdit.saving') : t('resourceEdit.save')}
        </button>
      </div>
    </form>
  );
}
