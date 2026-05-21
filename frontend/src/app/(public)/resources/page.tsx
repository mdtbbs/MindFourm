import Link from 'next/link';
import { resourceApi } from '@/lib/api/client';
import { Resource } from '@/types';
import { Download, FileText } from 'lucide-react';

export const revalidate = 60;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchResources(): Promise<{ data: Resource[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/resources`, { next: { revalidate: 60 } });
    if (!res.ok) return { data: [] };
    const json = await res.json();
    return json.success ? json.data : { data: [] };
  } catch {
    return { data: [] };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ResourcesPage() {
  const resources = await fetchResources();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100">资源中心</h1>
        <Link
          href="/resources/upload"
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          上传资源
        </Link>
      </div>

      {resources.data.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto text-surface-300 dark:text-gray-600 mb-4" />
          <p className="text-surface-500 dark:text-gray-400">暂无资源</p>
          <Link
            href="/resources/upload"
            className="inline-block mt-4 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            上传第一个资源
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.data.map((resource) => (
            <Link
              key={resource.id}
              href={`/resources/${resource.id}`}
              className="block bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 p-4 hover:border-primary-300 dark:hover:border-gray-600 transition-colors"
            >
              <h3 className="font-semibold text-surface-900 dark:text-gray-100 mb-2 truncate">
                {resource.title}
              </h3>
              <p className="text-sm text-surface-500 dark:text-gray-400 mb-3 line-clamp-2">
                {resource.description || '暂无描述'}
              </p>
              <div className="flex items-center justify-between text-xs text-surface-400 dark:text-gray-500">
                <span>{formatSize(resource.file_size)}</span>
                <span className="flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" />
                  {resource.download_count}
                </span>
              </div>
              {resource.category && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-surface-100 dark:bg-gray-800 text-surface-600 dark:text-gray-300 text-xs rounded-full">
                  {resource.category}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
