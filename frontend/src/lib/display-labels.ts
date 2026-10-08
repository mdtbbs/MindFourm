import resourceKinds from '../../../src/common/resource-kinds.json';

/**
 * Locale keys for the role/kind labels.
 *
 * These used to be Chinese string maps, which meant any English page that
 * rendered a role badge or a resource kind showed Chinese. Callers now resolve
 * the key through the catalog; `labelKeys` mirrors the shape so a lookup miss
 * keeps falling back to the raw value instead of inventing copy.
 */
export const ROLE_LABEL_KEYS: Record<string, string> = {
  super_admin: 'roles.super_admin',
  admin: 'roles.admin',
  moderator: 'roles.moderator',
  core_user: 'roles.core_user',
  active_user: 'roles.active_user',
  user: 'roles.user',
  guest: 'roles.guest',
  bot: 'roles.bot',
};

export function roleLabelKey(role?: string | null): string {
  if (!role) return 'roles.user';
  return ROLE_LABEL_KEYS[role] || '';
}

export const RESOURCE_TYPE_LABEL_KEYS: Record<string, string> = {
  external: 'resourceLabels.typeExternal',
  upload: 'resourceLabels.typeUpload',
};

export function resourceTypeLabelKey(type?: string | null): string {
  if (!type) return 'resourceLabels.typeUnknown';
  return RESOURCE_TYPE_LABEL_KEYS[type] || '';
}

export const RESOURCE_KINDS = resourceKinds;

/** Resource kinds come from the shared registry; the copy is a locale key. */
export const RESOURCE_KIND_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  RESOURCE_KINDS.map(({ value }) => [value, `resources.kinds.${value}`]),
);

export function resourceKindLabelKey(kind?: string | null): string {
  if (!kind) return 'resourceLabels.kindFallback';
  return RESOURCE_KIND_LABEL_KEYS[kind] || 'resourceLabels.kindOther';
}

export const RESOURCE_KIND_LABELS: Record<string, string> = Object.fromEntries(
  RESOURCE_KINDS.map(({ value, label }) => [value, label]),
);

export const ROLE_LABELS: Record<string, string> = ROLE_LABEL_KEYS;
export const RESOURCE_TYPE_LABELS: Record<string, string> = RESOURCE_TYPE_LABEL_KEYS;
