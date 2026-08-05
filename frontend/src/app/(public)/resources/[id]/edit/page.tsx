import { cache } from 'react';
import { Resource } from '@/types';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchApiData } from '@/lib/api/server-fetch';
import ResourceEditForm from '@/components/forum/resource-edit-form';
import { extractIdFromHybridParam } from '@/lib/seo/hybrid-param';

const fetchResource = cache(async (id: number): Promise<Resource | null> => {
  return fetchApiData<Resource | null>(`/api/resources/${id}`, {
    init: { cache: 'no-store' },
    fallback: null,
    forwardCookies: true,
  });
});

export default async function ResourceEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resourceId = extractIdFromHybridParam(id) ?? parseInt(id);
  const resource = Number.isFinite(resourceId) ? await fetchResource(resourceId) : null;
  if (!resource) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-6">
        <Link
          href={`/resources/${resource.id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
        >
          <ArrowLeft className="w-4 h-4" />
          返回资源详情
        </Link>
      </nav>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">编辑资源</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        修改资源的标题、介绍、分类等信息。
      </p>
      <ResourceEditForm resource={resource} />
    </div>
  );
}
