import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Resource } from '@/types';
import { notFound } from 'next/navigation';
import ResourceDetail from '@/components/forum/resource-detail';
import ResourceCommentThread from '@/components/forum/resource-comment-thread';
import { ArrowLeft } from 'lucide-react';
import { fetchApiData } from '@/lib/api/server-fetch';
import { toMetaDescription } from '@/lib/seo/description';
import { buildHybridParam, extractIdFromHybridParam } from '@/lib/seo/hybrid-param';

const fetchResource = cache(async (id: number): Promise<Resource | null> => {
  return fetchApiData<Resource | null>(`/api/resources/${id}`, {
    init: { cache: 'no-store' },
    fallback: null,
    forwardCookies: true,
    notFoundOn404: true,
    throwOnError: true,
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const resourceId = extractIdFromHybridParam(id) ?? parseInt(id);
  const resource = Number.isFinite(resourceId) ? await fetchResource(resourceId) : null;

  if (!resource) {
    notFound();
  }

  const description = toMetaDescription(resource.description || resource.content);
  const canonical = `/resources/${buildHybridParam(resource.id, resource.slug || '')}`;

  return {
    title: resource.title,
    description,
    alternates: { canonical },
    openGraph: { title: resource.title, description, type: 'article', url: canonical },
  };
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resourceId = extractIdFromHybridParam(id) ?? parseInt(id);
  const resource = Number.isFinite(resourceId) ? await fetchResource(resourceId) : null;
  if (!resource) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Link href="/resources" className="inline-flex items-center gap-1 transition-colors hover:text-[var(--primary)]">
          <ArrowLeft className="h-4 w-4" />
          资源中心
        </Link>
        <span>/</span>
        <span className="text-[var(--text)]">{resource.title}</span>
      </nav>

      <ResourceDetail resource={resource} />

      <div className="mt-8">
        <h2 className="mb-4 text-2xl font-bold">评论</h2>
        <ResourceCommentThread resourceId={resource.id} />
      </div>
    </div>
  );
}
