import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Resource } from '@/types';
import { notFound } from 'next/navigation';
import ResourceDetail from '@/components/forum/resource-detail';
import { ArrowLeft } from 'lucide-react';
import { fetchApiData } from '@/lib/api/server-fetch';
import { toMetaDescription } from '@/lib/seo/description';
import { buildHybridParam, extractIdFromHybridParam } from '@/lib/seo/hybrid-param';

/**
 * Rendered per request, not on a revalidation timer.
 *
 * Who may see a resource depends on who is asking: the API hides anything not yet
 * approved from everyone except its submitter and the moderators. Fetching this page
 * anonymously — as it did — meant a user who had just submitted a resource was
 * redirected to its detail page and shown "页面不存在". A shared cache cannot hold a
 * viewer-dependent answer, so the ISR window that used to be here is gone by design.
 */
const fetchResource = cache(async (id: number): Promise<Resource | null> => {
  return fetchApiData<Resource | null>(`/api/resources/${id}`, {
    init: { cache: 'no-store' },
    fallback: null,
    forwardCookies: true,
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
    // Not in the page body: `loading.tsx` flushes a 200 shell before the body runs, and
    // `notFound()` cannot change an already-sent status. generateMetadata runs first.
    notFound();
  }

  // These URLs are published in the sitemap, so having no metadata at all left them
  // inheriting only the generic site name and description.
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
  // Accepts both `/resources/12` and `/resources/12-slug`.
  const resourceId = extractIdFromHybridParam(id) ?? parseInt(id);
  const resource = Number.isFinite(resourceId) ? await fetchResource(resourceId) : null;
  if (!resource) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="mb-6">
        <Link href="/resources" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--primary)]">
          <ArrowLeft className="w-4 h-4" />
          返回资源中心
        </Link>
      </nav>
      <ResourceDetail resource={resource} />
    </div>
  );
}
