import { Resource, ResourceCategory } from '@/types';
import Link from 'next/link';
import ResourceCard from '@/components/forum/resource-card';
import ResourceFilters from '@/components/forum/resource-list-filters-client';
import { FileText } from 'lucide-react';

export const revalidate = 60;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchData(params: { category_id?: string; search?: string; sort?: string }) {
  const qs = new URLSearchParams();
  qs.set('limit', '30');
  if (params.category_id) qs.set('category_id', params.category_id);
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);

  const [resourcesRes, categoriesRes] = await Promise.all([
    fetch(`${API_BASE}/api/resources?${qs.toString()}`, { next: { revalidate: 60 } }),
    fetch(`${API_BASE}/api/resources/categories`, { next: { revalidate: 300 } }),
  ]);

  let resources: Resource[] = [];
  let categories: ResourceCategory[] = [];

  try {
    const rJson = await resourcesRes.json();
    if (rJson.success) resources = rJson.data?.data || rJson.data || [];
  } catch { /* empty */ }

  try {
    const cJson = await categoriesRes.json();
    if (cJson.success) categories = cJson.data || [];
  } catch { /* empty */ }

  return { resources, categories };
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: { category_id?: string; search?: string; sort?: string };
}) {
  const { resources, categories } = await fetchData(searchParams);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">资源中心</h1>
        <div className="flex gap-2">
          <Link
            href="/resources/submit"
            className="px-4 py-2 bg-[var(--bg-elevated)] text-[var(--text)] text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--bg-card)] border border-[var(--border)] transition-colors"
          >
            提交外链
          </Link>
          <Link
            href="/resources/upload"
            className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
          >
            上传文件
          </Link>
        </div>
      </div>

      <ResourceFilters
        categories={categories}
        initialCategory={searchParams.category_id}
        initialSearch={searchParams.search}
        initialSort={searchParams.sort}
      />

      {resources.length === 0 ? (
        <div className="text-center py-12 bg-[var(--bg-card)] rounded-[var(--radius-card)] border border-[var(--border)]">
          <FileText className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-4" />
          <p className="text-[var(--text-muted)] mb-4">暂无资源</p>
          <Link
            href="/resources/upload"
            className="inline-block px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)]"
          >
            上传第一个资源
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}