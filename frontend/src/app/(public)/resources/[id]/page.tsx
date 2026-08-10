import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Resource } from '@/types';
import { notFound } from 'next/navigation';
import ResourceDetail from '@/components/forum/resource-detail';
import ResourceCommentThread from '@/components/forum/resource-comment-thread';
import ResourceDetailV1 from '@/components/resources/resource-detail-v1';
import { ArrowLeft } from 'lucide-react';
import { fetchApiData } from '@/lib/api/server-fetch';
import { toMetaDescription } from '@/lib/seo/description';
import { buildHybridParam, extractIdFromHybridParam } from '@/lib/seo/hybrid-param';
import { getResourceV1, V1ResourceDetail } from '@/lib/api/v1/resources';
import { V1ApiError } from '@/lib/api/v1/transport';

const fetchResource = cache(async (id: number): Promise<Resource | null> => {
  return fetchApiData<Resource | null>(`/api/resources/${id}`, {
    init: { cache: 'no-store' },
    fallback: null,
    forwardCookies: true,
    notFoundOn404: true,
    throwOnError: true,
  });
});

/**
 * Try the V1 resource endpoint. Returns `null` when the feature flag is
 * off (`RESOURCE_V1_DISABLED`), the resource does not exist, or any
 * other transport failure occurs — the caller falls through to the
 * legacy renderer in all of those cases.
 */
const fetchResourceV1 = cache(async (id: number): Promise<V1ResourceDetail | null> => {
  try {
    let cookieHeader: string | undefined;
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get('forum_session');
      if (sessionCookie) {
        cookieHeader = `forum_session=${sessionCookie.value}`;
      }
    } catch {
      // cookies() may throw during static build; proceed without auth.
    }

    return await getResourceV1(id, cookieHeader ? { cookies: cookieHeader } : undefined);
  } catch (error) {
    if (error instanceof V1ApiError) {
      // Known V1 error codes: fall through to legacy renderer.
      if (
        error.code === 'RESOURCE_V1_DISABLED' ||
        error.code === 'RESOURCE_NOT_FOUND'
      ) {
        return null;
      }
    }
    // Any other failure (network, unexpected shape, ...): fall through.
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const resourceId = extractIdFromHybridParam(id) ?? parseInt(id);

  // Try V1 first — if the feature flag is on and the endpoint succeeds,
  // build metadata from the V1 payload.
  if (Number.isFinite(resourceId)) {
    const v1Resource = await fetchResourceV1(resourceId);
    if (v1Resource) {
      const description = toMetaDescription(v1Resource.summary);
      const canonical = `/resources/${buildHybridParam(v1Resource.id, '')}`;
      return {
        title: v1Resource.title,
        description,
        alternates: { canonical },
        openGraph: { title: v1Resource.title, description, type: 'article', url: canonical },
      };
    }
  }

  // Legacy fallback.
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

  // Try V1 first.
  const v1Resource = Number.isFinite(resourceId) ? await fetchResourceV1(resourceId) : null;

  if (v1Resource) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Link href="/resources" className="inline-flex items-center gap-1 transition-colors hover:text-[var(--primary)]">
            <ArrowLeft className="h-4 w-4" />
            资源中心
          </Link>
          <span>/</span>
          <span className="text-[var(--text)]">{v1Resource.title}</span>
        </nav>

        <ResourceDetailV1 resource={v1Resource} />

        <div className="mt-8">
          <h2 className="mb-4 text-2xl font-bold">评论</h2>
          <ResourceCommentThread resourceId={v1Resource.id} />
        </div>
      </div>
    );
  }

  // Fall back to legacy renderer.
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
