'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Download, ExternalLink, FileText, Loader2, Star, Trash2, Upload, User } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { resourceApi } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';
import { useToastStore } from '@/store/toast-store';
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

interface StarRatingProps {
  average: number;
  count: number;
  userRating: number | null;
  onRate: (rating: number) => void;
  readOnly?: boolean;
}

function StarRating({ average, count, userRating, onRate, readOnly }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = hoverRating ? star <= hoverRating : star <= Math.round(average);
          return (
            <button
              key={star}
              type="button"
              disabled={readOnly}
              onClick={() => onRate(star)}
              onMouseEnter={() => !readOnly && setHoverRating(star)}
              onMouseLeave={() => !readOnly && setHoverRating(0)}
              className={`p-0.5 transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
            >
              <Star
                className={`h-5 w-5 ${
                  filled
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'fill-none text-[var(--text-muted)]'
                }`}
              />
            </button>
          );
        })}
      </div>
      <span className="text-sm text-[var(--text-muted)]">
        {average.toFixed(1)} ({count} 评分)
      </span>
      {userRating && !readOnly && (
        <span className="text-xs text-[var(--text-muted)]">你的评分: {userRating}</span>
      )}
    </div>
  );
}

interface ResourceDetailProps {
  resource: Resource;
}

const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
      <span className="ml-2 text-xs text-[var(--text-muted)]">加载编辑器…</span>
    </div>
  ),
});

export default function ResourceDetail({ resource }: ResourceDetailProps) {
  const router = useRouter();
  const { user } = useAuth();
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);
  const [versions, setVersions] = useState<ResourceVersion[]>(resource.versions || []);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [newVersion, setNewVersion] = useState('');
  const [newVersionContent, setNewVersionContent] = useState('');
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(resource.rating_count || 0);
  const [ratingAverage, setRatingAverage] = useState(resource.rating_average || 0);

  // Load user's rating on mount
  useEffect(() => {
    if (user) {
      resourceApi.getUserRating(resource.id)
        .then((res) => setUserRating(res.rating))
        .catch(() => {});
    }
  }, [user, resource.id]);

  const selectedVersion = selectedVersionId
    ? versions.find((version) => version.id === selectedVersionId) || null
    : null;
  const selectedFileSize = selectedVersion?.file_size || resource.file_size;
  const selectedFileName = selectedVersion?.file_name || resource.file_name;
  const selectedVersionContent = selectedVersion?.content || null;
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
      if (newVersionContent.trim()) formData.append('content', newVersionContent.trim());
      formData.append('file', versionFile);
      const created = await resourceApi.addVersion(resource.id, formData);
      setVersions((current) => [created, ...current]);
      setSelectedVersionId(created.id);
      setNewVersion('');
      setNewVersionContent('');
      setVersionFile(null);
    } catch (err) {
      setVersionError(err instanceof Error ? err.message : '版本上传失败');
    } finally {
      setIsUploadingVersion(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    if (!window.confirm('确定删除这个资源？删除后无法恢复。')) return;
    setIsDeleting(true);
    try {
      await resourceApi.delete(resource.id);
      showSuccess('资源已删除');
      router.push('/resources');
    } catch (err) {
      showError(err instanceof Error ? err.message : '删除失败，请稍后重试');
      setIsDeleting(false);
    }
  };

  const handleRate = async (rating: number) => {
    if (!user) {
      showError('请先登录再评分');
      return;
    }
    try {
      const updated = await resourceApi.upsertRating(resource.id, rating);
      setUserRating(rating);
      setRatingCount(updated.rating_count || 0);
      setRatingAverage(updated.rating_average || 0);
      showSuccess('评分成功');
    } catch (err) {
      showError(err instanceof Error ? err.message : '评分失败');
    }
  };

  const handleDeleteRating = async () => {
    if (!user) return;
    try {
      await resourceApi.deleteRating(resource.id);
      const updated = await resourceApi.getById(resource.id);
      setUserRating(null);
      setRatingCount(updated.rating_count || 0);
      setRatingAverage(updated.rating_average || 0);
      showSuccess('已取消评分');
    } catch (err) {
      showError(err instanceof Error ? err.message : '取消评分失败');
    }
  };

  const handleDeleteVersion = async (versionId: number, versionLabel: string) => {
    if (!window.confirm(`确定删除版本 ${versionLabel}？文件也会被删除。`)) return;
    try {
      await resourceApi.deleteVersion(resource.id, versionId);
      setVersions((current) => current.filter((v) => v.id !== versionId));
      if (selectedVersionId === versionId) setSelectedVersionId(null);
      showSuccess('版本已删除');
    } catch (err) {
      showError(err instanceof Error ? err.message : '删除版本失败');
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h1 className="mb-3 text-2xl font-bold text-[var(--text)]">{resource.title}</h1>

      {resource.description && (
        <div className="mb-4 max-w-3xl rounded-[var(--radius-card)] bg-[var(--bg-elevated)] p-4 text-sm leading-6">
          <MarkdownRenderer content={resource.description} />
        </div>
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

      <div className="mb-4 flex items-center gap-3">
        <StarRating
          average={ratingAverage}
          count={ratingCount}
          userRating={userRating}
          onRate={handleRate}
          readOnly={!user}
        />
        {userRating && user && (
          <button
            onClick={handleDeleteRating}
            className="text-xs text-[var(--text-muted)] hover:text-red-500 underline"
          >
            取消评分
          </button>
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
          {isOwner && selectedVersion && versions.length > 1 && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => handleDeleteVersion(selectedVersion.id, selectedVersion.version || '')}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                删除此版本
              </button>
            </div>
          )}
        </div>
      )}

      {resource.content && (
        <div className="mb-6 rounded-[var(--radius-card)] bg-[var(--bg-elevated)] p-4">
          <MarkdownRenderer content={resource.content} />
        </div>
      )}

      {selectedVersionContent && (
        <div className="mb-6 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">{selectedVersion?.version} 更新说明</h2>
          <MarkdownRenderer content={selectedVersionContent} />
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
        <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-6">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">管理此资源</p>
            <p className="text-xs text-[var(--text-muted)]">删除后资源将对所有用户不可见</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/resources/${resource.id}/edit`}
              className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-card)]"
            >
              编辑资源
            </Link>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {isDeleting ? '删除中...' : '删除资源'}
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <form onSubmit={handleVersionUpload} className="mt-6 space-y-3 border-t border-[var(--border)] pt-6">
          <h2 className="text-sm font-semibold text-[var(--text)]">上传新版本</h2>
          {versionError && (
            <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              {versionError}
            </div>
          )}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text)]">版本说明 / 更新日志</label>
            <TiptapEditor
              value={newVersionContent}
              onChange={setNewVersionContent}
              placeholder="可选：说明本版本的改动、兼容性和注意事项，支持粘贴 / 拖放上传图片..."
              minHeight="140px"
              compact
              imageUpload
              testId="resource-version-content-input"
            />
          </div>
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
