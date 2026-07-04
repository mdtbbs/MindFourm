'use client';

import { useState } from 'react';
import { Resource, ResourceVersion } from '@/types';
import { Download, ExternalLink, Calendar, User, FileText, Loader2, Upload } from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';
import * as LucideIcons from 'lucide-react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import VersionSelector from '@/components/ui/version-selector';

function CategoryIcon({ icon }: { icon: string | null }) {
  const IconComponent = icon && ((LucideIcons as unknown) as Record<string, React.ComponentType<{ className?: string }>>)[icon];
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
    <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)] p-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mb-4">{resource.title}</h1>

      <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)] mb-4">
        <span className="flex items-center gap-1">
          <User className="w-4 h-4" />
          {resource.username}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {new Date(resource.created_at).toLocaleDateString('zh-CN')}
        </span>
        <span className="flex items-center gap-1">
          <Download className="w-4 h-4" />
          {resource.download_count} 次下载
        </span>
        {selectedFileSize > 0 && <span>{formatSize(selectedFileSize)}</span>}
        {resource.category_name && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-[var(--bg-elevated)] rounded-full text-xs">
            <CategoryIcon icon={resource.category_icon} />
            {resource.category_name}
          </span>
        )}
      </div>

      {(versions.length > 0 || resource.version) && (
        <div className="mb-4 p-3 bg-[var(--bg-elevated)] rounded-[var(--radius-sm)]">
          <VersionSelector
            versions={versions}
            baseVersion={resource.version}
            selectedVersionId={selectedVersionId}
            onSelect={setSelectedVersionId}
          />
        </div>
      )}

      {resource.content_html ? (
        <div className="mb-6 p-4 bg-[var(--bg-elevated)] rounded-[var(--radius-card)]">
          <MarkdownRenderer content={resource.content_html} />
        </div>
      ) : resource.description ? (
        <div className="mb-6 p-4 bg-[var(--bg-elevated)] rounded-[var(--radius-card)] text-[var(--text-secondary)]">
          {resource.description}
        </div>
      ) : null}

      {hasDownloadFile ? (
        <a
          href={resourceApi.download(resource.id, selectedVersion?.id)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
        >
          <Download className="w-5 h-5" />
          下载 {selectedFileName || '文件'}
        </a>
      ) : (
        <a
          href={resource.external_url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
        >
          <ExternalLink className="w-5 h-5" />
          访问外链
        </a>
      )}

      {isOwner && (
        <form onSubmit={handleVersionUpload} className="mt-6 pt-6 border-t border-[var(--border)] space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">上传新版本</h2>
          {versionError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-[var(--radius)] text-red-600 dark:text-red-400 text-sm">
              {versionError}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
            <input
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="版本号"
              maxLength={50}
              className="px-3 py-2 bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] text-sm"
            />
            <label className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--radius)] text-sm cursor-pointer">
              <Upload className="w-4 h-4 text-[var(--text-muted)]" />
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
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius)] text-sm hover:bg-[var(--primary-dark)] disabled:opacity-50"
            >
              {isUploadingVersion && <Loader2 className="w-4 h-4 animate-spin" />}
              上传
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
