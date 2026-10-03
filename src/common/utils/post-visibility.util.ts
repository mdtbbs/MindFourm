import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export interface PostViewer { id: number; role: string }

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
  }
  return qb;
}

/** Anonymous shared caches, feeds and public integrations must never contain restricted posts. */
export function applyPublicPostVisibility<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, alias = 'post'): SelectQueryBuilder<T> {
  return applyPostVisibility(qb, alias, undefined, 'published');
}
