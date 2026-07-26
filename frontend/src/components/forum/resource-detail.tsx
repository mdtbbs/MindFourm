'use client';

import { useState } from 'react';
import { Calendar, Download, ExternalLink, FileText, Loader2, Upload, User } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import VersionSelector from '@/components/ui/version-selector';
import { Resource, ResourceVersion } from '@/types';
import { safeHref } from '@/lib/url/safe-url';

function CategoryIcon({ icon }: { icon: string | null }) {
  const IconComponent =
    icon && ((LucideIcons as unknown) as Record<string, React.ComponentType<{ className?: string }>>)[icon];
  return IconComponent ? <IconComponent className="w-4 h-4" /> : <FileText className="w-4 h-4" />;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ResourceDetailProps {
  resource: Resource;
}

export default function ResourceDetail({ resource }: ResourceDetailProps) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<ResourceVersion[]>(resource.versions || []);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [newVersion, setNewVersion] = useState('');
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  const selectedVersion = selectedVersionId
    ? versions.find((version) => version.id === selectedVersionId) || null
    : null;
  const selectedFileSize = selectedVersion?.file_size || resource.file_size;
  const selectedFileName = selectedVersion?.file_name || resource.file_name;
  const isOwner = user?.id === resource.user_id;
  const hasDownloadFile = resource.resource_type === 'upload' || !!selectedVersion;
  // Rejects `javascript:` and other script-bearing schemes; undefined when unsafe so
  // no clickable link is rendered at all.
  const externalHref = safeHref(resource.external_url);

  const handleVersionUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersion.trim() || !versionFile) {
      setVersionError('请填写版本号并选择版本文件');
      return;
    }

    setIsUploadingVersion(true);
    setVersionError(null);

    try {
      const formData = new FormData();
      formData.append('version', newVersion.trim());
      formData.append('file', versionFile);
      const created = await resourceApi.addVersion(resource.id, formData);
      setVersions((current) => [created, ...current]);
      setSelectedVersionId(created.id);
      setNewVersion('');
      setVersionFile(null);
    } catch (err) {
      setVersionError(err instanceof Error ? err.message : '版本上传失败');
    } finally {
      setIsUploadingVersion(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h1 className="mb-3 text-2xl font-bold text-[var(--text)]">{resource.title}</h1>

      {resource.description && (
        <p className="mb-4 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
          {resource.description}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <User className="h-4 w-4" />
          {resource.username}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          {new Date(resource.created_at).toLocaleDateString('zh-CN')}
        </span>
        <span className="flex items-center gap-1">
          <Download className="h-4 w-4" />
          {resource.download_count} 次下载
        </span>
        {selectedFileSize > 0 && <span>{formatSize(selectedFileSize)}</span>}
        {resource.category_name && (
          <span className="flex items-center gap-1 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs">
            <CategoryIcon icon={resource.category_icon} />
            {resource.category_name}
          </span>
        )}
      </div>

      {(versions.length > 0 || resource.version) && (
        <div className="mb-4 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] p-3">
          <VersionSelector
            versions={versions}
            baseVersion={resource.version}
            selectedVersionId={selectedVersionId}
            onSelect={setSelectedVersionId}
          />
        </div>
      )}

      {resource.content_html && (
        <div className="mb-6 rounded-[var(--radius-card)] bg-[var(--bg-elevated)] p-4">
          <MarkdownRenderer content={resource.content_html} />
        </div>
      )}

      {resource.status === 'pending' && (
        <div className="mb-4 flex items-center gap-3 border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <svg className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-amber-800 dark:text-amber-200">
            此资源正在等待审核，审核通过后可下载。
          </span>
        </div>
      )}

      {resource.status === 'rejected' && (
        <div className="mb-4 flex items-center gap-3 border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/30">
          <svg className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          <span className="text-sm text-red-800 dark:text-red-200">
            此资源未通过审核{resource.reject_reason ? `：${resource.reject_reason}` : ''}
          </span>
        </div>
      )}

      {hasDownloadFile ? (
        resource.status === 'pending' || resource.status === 'rejected' ? (
          <button
            disabled
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-[var(--radius)] bg-gray-300 px-6 py-3 font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          >
            <Download className="h-5 w-5" />
            {resource.status === 'pending' ? '等待审核' : '审核未通过'}
          </button>
        ) : (
          <a
            href={resourceApi.download(resource.id, selectedVersion?.id)}
            className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
          >
            <Download className="h-5 w-5" />
            下载 {selectedFileName || '文件'}
          </a>
        )
      ) : externalHref ? (
        <a
          href={externalHref}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
        >
          <ExternalLink className="h-5 w-5" />
          访问外链
        </a>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">该资源的外部链接无效或已被移除。</p>
      )}

      {isOwner && (
        <form onSubmit={handleVersionUpload} className="mt-6 space-y-3 border-t border-[var(--border)] pt-6">
          <h2 className="text-sm font-semibold text-[var(--text)]">上传新版本</h2>
          {versionError && (
            <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              {versionError}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
            <input
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="版本号"
              maxLength={50}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm">
              <Upload className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="truncate">{versionFile?.name || '选择版本文件'}</span>
              <input
                type="file"
                accept=".zip,.rar,.7z,.tar,.gz,.jar,.msav,.msch,.json,.hjson,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif"
                onChange={(e) => setVersionFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
            <button
              type="submit"
              disabled={isUploadingVersion}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
            >
              {isUploadingVersion && <Loader2 className="h-4 w-4 animate-spin" />}
              上传
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
