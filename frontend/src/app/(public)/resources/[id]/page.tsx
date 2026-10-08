import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Resource } from '@/types';
import { notFound } from 'next/navigation';
import ResourceDetail from '@/components/forum/resource-detail';
import { ArrowLeft } from 'lucide-react';
import { fetchApiData } from '@/lib/api/server-fetch';
import { toMetaDescription } from '@/lib/seo/description';
import { absoluteUrl } from '@/lib/seo/site-url';
import JsonLd from '@/components/seo/json-ld';
import { resourceKindLabel } from '@/lib/display-labels';
import { buildHybridParam, extractIdFromHybridParam } from '@/lib/seo/hybrid-param';

const fetchResource = cache(async (id: number | string): Promise<Resource | null> => {
  // Public resources should render without depending on the current user's
  // MindAuth/session state. This keeps a stale or temporarily unavailable auth
  // session from taking down a public resource detail page.
  const publicResource = await fetchApiData<Resource | null>(`/api/resources/${id}`, {
    init: { cache: 'no-store' },
    fallback: null,
    throwOnError: false,
  });
  if (publicResource) return publicResource;

  // Owners and staff can still open non-public submissions through the
  // authenticated fallback.
  return fetchApiData<Resource | null>(`/api/resources/${id}`, {
    init: { cache: 'no-store' },
    fallback: null,
    forwardCookies: true,
    notFoundOn404: true,
    throwOnError: true,
  });
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const resourceId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id : extractIdFromHybridParam(id) ?? parseInt(id);
  const resource = typeof resourceId === 'string' || Number.isFinite(resourceId) ? await fetchResource(resourceId) : null;
  if (!resource) notFound();
  const description = toMetaDescription(resource.description || resource.content);
  const canonical = `/resources/${buildHybridParam(resource.id, resource.slug || '')}`;
  const kind = resourceKindLabel(resource.resource_kind);
  return {
    title: `${resource.title} - Mindustry ${kind}`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${resource.title} - Mindustry ${kind}`,
      description,
      type: 'article',
      url: canonical,
      images: resource.metadata?.cover_image_url ? [resource.metadata.cover_image_url] : undefined,
    },
  };
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resourceId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) ? id : extractIdFromHybridParam(id) ?? parseInt(id);
  const resource = typeof resourceId === 'string' || Number.isFinite(resourceId) ? await fetchResource(resourceId) : null;
  if (!resource) notFound();
  const resourcePath = `/resources/${buildHybridParam(resource.id, resource.slug || '')}`;
  const resourceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: resource.title,
    url: absoluteUrl(resourcePath),
    description: toMetaDescription(resource.description || resource.content),
    datePublished: resource.created_at,
    dateModified: resource.updated_at || resource.created_at,
    author: { '@type': 'Person', name: resource.username || `用户 #${resource.user_id}`, url: absoluteUrl(`/users/${resource.user_id}`) },
    ...(resource.metadata?.cover_image_url ? { image: absoluteUrl(resource.metadata.cover_image_url) } : {}),
    ...(resource.resource_kind ? { genre: resourceKindLabel(resource.resource_kind) } : {}),
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: '资源中心', item: absoluteUrl('/resources') },
      ...(resource.category_name ? [{ '@type': 'ListItem', position: 3, name: resource.category_name, item: absoluteUrl(`/resources?category_id=${resource.category_id}`) }] : []),
      { '@type': 'ListItem', position: resource.category_name ? 4 : 3, name: resource.title, item: absoluteUrl(resourcePath) },
    ],
  };

  return <div className="content-width-detail mx-auto min-w-0 px-4 py-8 sm:px-6 lg:px-8">
    <JsonLd data={[resourceJsonLd, breadcrumbJsonLd]} />
    <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <Link href="/resources" className="inline-flex items-center gap-1 transition-colors hover:text-[var(--primary)]"><ArrowLeft className="h-4 w-4" />资源中心</Link>
      <span>/</span>
      <span className="text-[var(--text)]">{resource.title}</span>
    </nav>
    <ResourceDetail resource={resource} />
  </div>;
}
