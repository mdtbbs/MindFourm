import Link from 'next/link';
import { Resource } from '@/types';
import { notFound } from 'next/navigation';
import ResourceDetail from '@/components/forum/resource-detail';
import { ArrowLeft } from 'lucide-react';
import { fetchApiData } from '@/lib/api/server-fetch';

export const revalidate = 60;

async function fetchResource(id: number): Promise<Resource | null> {
  return fetchApiData<Resource | null>(`/api/resources/${id}`, {
    init: { next: { revalidate: 60 } },
    fallback: null,
  });
}

export default async function ResourceDetailPage({ params }: { params: { id: string } }) {
  const resource = await fetchResource(parseInt(params.id));
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
