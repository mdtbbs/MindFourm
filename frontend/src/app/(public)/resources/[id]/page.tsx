import Link from 'next/link';
import { resourceApi } from '@/lib/api/client';
import { Resource } from '@/types';
import { Download, ArrowLeft, Calendar, User } from 'lucide-react';
import { notFound } from 'next/navigation';

export const revalidate = 60;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchResource(id: number): Promise<Resource | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/resources/${id}`, { next: { tags: [`resource-${id}`] } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ResourceDetailPage({ params }: { params: { id: string } }) {
  const resource = await fetchResource(parseInt(params.id));
  if (!resource) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-surface-500 dark:text-gray-400">
        <Link href="/" className="hover:text-primary-600">首页</Link>
        <span className="mx-2">/</span>
        <Link href="/resources" className="hover:text-primary-600">资源中心</Link>
        <span className="mx-2">/</span>
        <span className="text-surface-900 dark:text-gray-100">{resource.title}</span>
      </nav>

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100 mb-4">{resource.title}</h1>

        {/* Meta */}
        <div className="flex flex-wrap gap-4 text-sm text-surface-500 dark:text-gray-400 mb-6">
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
          <span>{formatSize(resource.file_size)}</span>
          {resource.category && (
            <span className="px-2 py-0.5 bg-surface-100 dark:bg-gray-800 text-surface-600 dark:text-gray-300 text-xs rounded-full">
              {resource.category}
            </span>
          )}
        </div>

        {/* Description */}
        {resource.description && (
          <div className="mb-6 p-4 bg-surface-50 dark:bg-gray-800 rounded-lg text-surface-700 dark:text-gray-300">
            {resource.description}
          </div>
        )}

        {/* Download button */}
        <a
          href={resourceApi.download(resource.id)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Download className="w-5 h-5" />
          下载 {resource.file_name}
        </a>
      </div>
    </div>
  );
}
