import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export interface PostViewer { id: number; role: string }

/** Hide resource discussion threads unless their backing resource is public now. */
export function applyResourceDiscussionVisibility<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>, alias = 'post', viewer?: PostViewer,
): SelectQueryBuilder<T> {
  const publicResourceDiscussion = `EXISTS (
    SELECT 1
      FROM resources post_visibility_resource
      LEFT JOIN resource_categories post_visibility_resource_category
        ON post_visibility_resource_category.id = post_visibility_resource.category_id
     WHERE post_visibility_resource.discussion_thread_id = ${alias}.id
       AND post_visibility_resource.deleted_at IS NULL
       AND post_visibility_resource.is_public = 1
       AND post_visibility_resource.status IN ('approved', 'published')
       AND (post_visibility_resource.visibility IS NULL OR post_visibility_resource.visibility = 'public')
       AND (post_visibility_resource.category_id IS NULL OR post_visibility_resource_category.is_active = 1)
  )`;
  // `post_type` predates the resource-discussion kind and can be NULL on older rows.
  // COALESCE keeps those normal posts visible instead of letting SQL UNKNOWN filter them.
  return qb.andWhere(viewer
    ? `(COALESCE(${alias}.post_type, 'normal') <> 'resource_discussion' OR ${alias}.user_id = :postVisibilityUser OR ${publicResourceDiscussion})`
    : `(COALESCE(${alias}.post_type, 'normal') <> 'resource_discussion' OR ${publicResourceDiscussion})`,
  viewer ? { postVisibilityUser: viewer.id } : undefined);
}

/** Use this before pagination/counting so every public projection obeys the same wall. */
export function applyPostVisibility<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>, alias = 'post', viewer?: PostViewer, requestedStatus?: string,
): SelectQueryBuilder<T> {
  const staff = !!viewer && ['admin', 'moderator'].includes(viewer.role);
  if (requestedStatus) {
    qb.andWhere(`${alias}.status = :postVisibilityStatus`, { postVisibilityStatus: requestedStatus });
    if (requestedStatus !== 'published' && !staff) {
      if (viewer) qb.andWhere(`${alias}.user_id = :postVisibilityUser`, { postVisibilityUser: viewer.id });
      else qb.andWhere('1 = 0');
    }
  } else if (staff) {
    qb.andWhere(`${alias}.status IN (:...postVisibilityStatuses)`, { postVisibilityStatuses: ['published', 'pending'] });
  } else if (viewer) {
    qb.andWhere(`(${alias}.status = :postVisibilityPublished OR (${alias}.status = :postVisibilityPending AND ${alias}.user_id = :postVisibilityUser))`, {
      postVisibilityPublished: 'published', postVisibilityPending: 'pending', postVisibilityUser: viewer.id,
    });
  } else {
    qb.andWhere(`${alias}.status = :postVisibilityStatus`, { postVisibilityStatus: 'published' });
  }
  if (!staff) {
    qb.andWhere(viewer
      ? `(${alias}.required_group_id IS NULL OR EXISTS (SELECT 1 FROM group_members post_visibility_member WHERE post_visibility_member.group_id = ${alias}.required_group_id AND post_visibility_member.user_id = :postVisibilityUser))`
      : `${alias}.required_group_id IS NULL`, viewer ? { postVisibilityUser: viewer.id } : undefined);

    // The shared gate also applies to feeds, search, and reply projections.
    applyResourceDiscussionVisibility(qb, alias, viewer);
  }
  return qb;
}

/** Anonymous shared caches, feeds and public integrations must never contain restricted posts. */
export function applyPublicPostVisibility<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, alias = 'post'): SelectQueryBuilder<T> {
  return applyPostVisibility(qb, alias, undefined, 'published');
}
