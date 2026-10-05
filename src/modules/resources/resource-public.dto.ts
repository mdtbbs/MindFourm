import type { Resource } from '@entities/resource.entity';
import { normalizeResourceMetadata } from './resource-detail.util';

/** Explicit public boundary: storage paths, moderation notes and private User columns never escape. */
const PUBLIC_FIELDS = [
  'id', 'public_id', 'title', 'slug', 'user_id', 'category_id', 'resource_type', 'resource_kind',
  'version', 'content_language', 'status', 'summary', 'description', 'file_name', 'file_size', 'mime_type',
  'content_hash', 'external_url', 'homepage_url', 'source_url', 'license', 'origin_site', 'origin_resource_id',
  'origin_url', 'latest_published_version_id', 'discussion_thread_id', 'download_count', 'is_featured',
  'view_count', 'rating_count', 'rating_sum', 'rating_average', 'created_at', 'updated_at', 'visibility',
  'renderer_status', 'renderer_error_code', 'renderer_parser_version', 'favorite_count', 'like_count',
  'is_favorited', 'is_liked', 'is_subscribed', 'trending_score',
] as const;

export function toPublicResource(resource: Resource, card = false): Record<string, any> {
  const unreviewedQuarantinedBinary = (resource as any).unreviewed_quarantined_binary === true
    || (typeof resource.file_path === 'string' && /[\\/]\.quarantine[\\/]/.test(resource.file_path));
  const result: Record<string, any> = {};
  for (const field of PUBLIC_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(resource, field)) {
      result[field] = field === 'renderer_status' && unreviewedQuarantinedBinary
        ? 'unavailable'
        : (resource as any)[field];
    }
  }
  if (!card) {
    for (const field of ['content', 'content_json', 'content_html', 'content_text', 'content_schema_version'] as const) {
      result[field] = resource[field];
    }
  } else {
    result.description = String(resource.summary || resource.description || '').slice(0, 360);
    if (result.summary) result.summary = String(result.summary).slice(0, 360);
  }
  const renderer = unreviewedQuarantinedBinary
    ? {}
    : (resource as any).renderer_summary || resource.renderer_metadata_json || {};
  const scalar = (value: unknown) => value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  return {
    ...result,
    ...(!['approved', 'published'].includes(resource.status) ? { reject_reason: resource.reject_reason || null } : {}),
    user: resource.user ? { id: resource.user.id, username: resource.user.username, avatar_url: resource.user.avatar_url, role: resource.user.role } : null,
    is_public: resource.is_public === 1,
    use_mfl: resource.use_mfl === 1,
    file_size: resource.file_size || 0,
    slug: resource.slug || null,
    rating_count: resource.rating_count || 0,
    rating_sum: resource.rating_sum || 0,
    rating_average: Number(resource.rating_average) || 0,
    comment_count: Number((resource as any).comment_count) || 0,
    username: resource.user?.username || '',
    avatar_url: resource.user?.avatar_url || null,
    category_name: resource.category?.name || null,
    category_icon: resource.category?.icon || null,
    metadata: normalizeResourceMetadata(resource.metadata_json),
    ...(card ? { renderer_summary: { width: scalar(renderer.width), height: scalar(renderer.height), build: scalar(renderer.build) } } : { renderer_metadata: unreviewedQuarantinedBinary ? null : resource.renderer_metadata_json || null }),
    preview_url: !unreviewedQuarantinedBinary && resource.renderer_status === 'ready' ? `/api/resources/${resource.id}/preview` : null,
  };
}

/** Cards deliberately omit canonical documents and renderer production graphs. */
export const RESOURCE_CARD_COLUMNS = PUBLIC_FIELDS.filter((field) => ![
  'favorite_count', 'like_count', 'is_favorited', 'is_liked', 'is_subscribed', 'trending_score', 'summary', 'description',
].includes(field)).map((field) => `resource.${field}`).concat([
  'resource.is_public', 'resource.use_mfl', 'resource.metadata_json',
  'user.id', 'user.username', 'user.avatar_url', 'user.role', 'category.id', 'category.name', 'category.icon',
]);
