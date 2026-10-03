import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Resource } from '@/types';
import ResourceDetail from '@/components/forum/resource-detail';
import JsonLd from '@/components/seo/json-ld';
import { fetchApiData } from '@/lib/api/server-fetch';
import { absoluteUrl } from '@/lib/seo/site-url';
import { buildHybridParam, extractIdFromHybridParam } from '@/lib/seo/hybrid-param';

type RouteParams = Promise<{ id: string; versionId: string }>;

async function getResource(id: string): Promise<Resource | null> {
  const resourceId = extractIdFromHybridParam(id) ?? Number.parseInt(id, 10);
  if (!Number.isFinite(resourceId)) return null;
  const publicResource = await fetchApiData<Resource | null>(`/api/resources/${resourceId}`, {
    init: { cache: 'no-store' }, fallback: null, throwOnError: false,
  });
  if (publicResource) return publicResource;
  return fetchApiData<Resource | null>(`/api/resources/${resourceId}`, {
    init: { cache: 'no-store' }, fallback: null, forwardCookies: true,
    notFoundOn404: true, throwOnError: false,
  });
}

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { id, versionId } = await params;
  const resource = await getResource(id);
  const version = resource?.versions?.find((item) => item.public_id === versionId);
  if (!resource || !version) notFound();
  const resourceParam = buildHybridParam(resource.id, resource.slug || '');
  const canonical = `/resources/${resourceParam}/versions/${encodeURIComponent(versionId)}`;
  return {
    title: `${resource.title} ${version.version} - Mindustry Resource`,
    description: version.release_notes || resource.description || undefined,
    alternates: { canonical },
    openGraph: { title: `${resource.title} ${version.version}`, type: 'article', url: canonical },
  };
}

export default async function ResourceVersionPage({ params }: { params: RouteParams }) {
  const { id, versionId } = await params;
  const resource = await getResource(id);
  const version = resource?.versions?.find((item) => item.public_id === versionId);
  if (!resource || !version) notFound();
  const canonicalResourcePath = `/resources/${buildHybridParam(resource.id, resource.slug || '')}`;
  return <div className="content-width-detail mx-auto min-w-0 px-4 py-8 sm:px-6 lg:px-8">
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: `${resource.title} ${version.version}`,
      url: absoluteUrl(`${canonicalResourcePath}/versions/${encodeURIComponent(versionId)}`),
      version: version.version,
      datePublished: version.published_at || version.created_at,
      isPartOf: { '@type': 'CreativeWork', name: resource.title, url: absoluteUrl(canonicalResourcePath) },
    }} />
    <ResourceDetail resource={resource} selectedVersionPublicId={versionId} />
  </div>;
}
