import resourceKinds from '../../common/resource-kinds.json';

export const RESOURCE_KINDS = resourceKinds;
export const RESOURCE_KIND_VALUES = resourceKinds.map(({ value }) => value);
export const RESOURCE_KIND_LABELS = Object.fromEntries(resourceKinds.map(({ value, label }) => [value, label]));

export function isResourceKind(value: unknown): value is string {
  return typeof value === 'string' && RESOURCE_KIND_VALUES.includes(value);
}

export function resourceKindLabel(value: string | null | undefined): string {
  return value && RESOURCE_KIND_LABELS[value] || RESOURCE_KIND_LABELS.other;
}
