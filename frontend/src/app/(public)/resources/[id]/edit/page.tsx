import { cache } from 'react';
import { Resource } from '@/types';
import { notFound } from 'next/navigation';
import { fetchApiData } from '@/lib/api/server-fetch';
import ResourceEditPageContent from '@/components/forum/resource-edit-page-content';
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

  return <ResourceEditPageContent resource={resource} />;
}
