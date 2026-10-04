export type IndexedModContent = {
  content_type: string;
  internal_name: string;
  display_name?: string | null;
  description?: string | null;
  properties?: Record<string, unknown> | null;
};
export type ModContentChange = {
  status: 'added' | 'changed' | 'removed' | 'renamed';
  content_type: string;
  internal_name: string;
  previous_internal_name?: string;
  before?: IndexedModContent;
  after?: IndexedModContent;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Diffs versioned Content by `(type, internal_name)` while honoring author-declared rename aliases. */
export function diffModContent(
  before: readonly IndexedModContent[],
  after: readonly IndexedModContent[],
  aliases: readonly { content_type: string; old_internal_name: string; new_internal_name: string }[] = [],
): ModContentChange[] {
  const key = (item: IndexedModContent) => `${item.content_type}\0${item.internal_name}`;
  const oldItems = new Map(before.map((item) => [key(item), item]));
  const newItems = new Map(after.map((item) => [key(item), item]));
  const renamedPairs = new Map<string, string>();
  for (const alias of aliases) {
    const from = `${alias.content_type}\0${alias.old_internal_name}`;
    const to = `${alias.content_type}\0${alias.new_internal_name}`;
    if (oldItems.has(from) && newItems.has(to)) renamedPairs.set(from, to);
  }
  const consumedOld = new Set<string>(); const consumedNew = new Set<string>();
  const changes: ModContentChange[] = [];
  for (const [oldKey, newKey] of renamedPairs) {
    const previous = oldItems.get(oldKey)!; const current = newItems.get(newKey)!;
    consumedOld.add(oldKey); consumedNew.add(newKey);
    changes.push({ status: 'renamed', content_type: current.content_type, previous_internal_name: previous.internal_name, internal_name: current.internal_name, before: previous, after: current });
  }
  for (const [contentKey, previous] of oldItems) {
    if (consumedOld.has(contentKey)) continue;
    const current = newItems.get(contentKey);
    if (!current) changes.push({ status: 'removed', content_type: previous.content_type, internal_name: previous.internal_name, before: previous });
    else {
      consumedOld.add(contentKey); consumedNew.add(contentKey);
      if (canonical({ display_name: previous.display_name, description: previous.description, properties: previous.properties }) !== canonical({ display_name: current.display_name, description: current.description, properties: current.properties })) {
        changes.push({ status: 'changed', content_type: current.content_type, internal_name: current.internal_name, before: previous, after: current });
      }
    }
  }
  for (const [contentKey, current] of newItems) {
    if (!consumedNew.has(contentKey) && !oldItems.has(contentKey)) changes.push({ status: 'added', content_type: current.content_type, internal_name: current.internal_name, after: current });
  }
  return changes.sort((left, right) => left.content_type.localeCompare(right.content_type) || left.internal_name.localeCompare(right.internal_name));
}

export type ResourceFileSnapshot = { name: string; sha256: string | null };
export type VersionSnapshot = {
  manifest: Record<string, unknown>;
  content: IndexedModContent[];
  dependencies: Array<{ mod_id: string; kind: string; version_constraint?: string | null }>;
  files: ResourceFileSnapshot[];
  game_version_min?: string | null;
  game_version_max?: string | null;
};

export function diffModVersion(
  before: VersionSnapshot,
  after: VersionSnapshot,
  aliases: readonly { content_type: string; old_internal_name: string; new_internal_name: string }[] = [],
) {
  const fileMap = (items: ResourceFileSnapshot[]) => new Map(items.map((item) => [item.name, item.sha256]));
  const oldFiles = fileMap(before.files); const newFiles = fileMap(after.files);
  const files = [
    ...[...oldFiles].filter(([name]) => !newFiles.has(name)).map(([name]) => ({ status: 'removed' as const, name, before_sha256: oldFiles.get(name), after_sha256: null })),
    ...[...newFiles].filter(([name]) => !oldFiles.has(name)).map(([name]) => ({ status: 'added' as const, name, before_sha256: null, after_sha256: newFiles.get(name) })),
    ...[...oldFiles].filter(([name, hash]) => newFiles.has(name) && newFiles.get(name) !== hash).map(([name, hash]) => ({ status: 'changed' as const, name, before_sha256: hash, after_sha256: newFiles.get(name) || null })),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const dependencyKey = (item: VersionSnapshot['dependencies'][number]) => `${item.kind}\0${item.mod_id}`;
  const oldDependencies = new Map(before.dependencies.map((item) => [dependencyKey(item), item]));
  const newDependencies = new Map(after.dependencies.map((item) => [dependencyKey(item), item]));
  const dependencies = [
    ...[...oldDependencies].filter(([key]) => !newDependencies.has(key)).map(([, item]) => ({ status: 'removed' as const, ...item })),
    ...[...newDependencies].filter(([key]) => !oldDependencies.has(key)).map(([, item]) => ({ status: 'added' as const, ...item })),
    ...[...newDependencies].filter(([key, item]) => oldDependencies.has(key)
      && oldDependencies.get(key)?.version_constraint !== item.version_constraint)
      .map(([key, item]) => ({ status: 'changed' as const, before: oldDependencies.get(key), after: item })),
  ];
  const manifestChanges = [...new Set([...Object.keys(before.manifest), ...Object.keys(after.manifest)])]
    .filter((field) => canonical(before.manifest[field]) !== canonical(after.manifest[field]))
    .sort()
    .map((field) => ({ field, before: before.manifest[field] ?? null, after: after.manifest[field] ?? null }));
  const content = diffModContent(before.content, after.content, aliases);
  return {
    manifest: manifestChanges,
    content,
    dependencies,
    files,
    game_version: { before_min: before.game_version_min || null, before_max: before.game_version_max || null, after_min: after.game_version_min || null, after_max: after.game_version_max || null },
    summary: {
      added_content: content.filter((item) => item.status === 'added').length,
      changed_content: content.filter((item) => item.status === 'changed').length,
      removed_content: content.filter((item) => item.status === 'removed').length,
      renamed_content: content.filter((item) => item.status === 'renamed').length,
      added_files: files.filter((item) => item.status === 'added').length,
      changed_files: files.filter((item) => item.status === 'changed').length,
      removed_files: files.filter((item) => item.status === 'removed').length,
      changed_manifest_fields: manifestChanges.length,
      changed_dependencies: dependencies.filter((item) => item.status === 'changed').length,
      added_dependencies: dependencies.filter((item) => item.status === 'added').length,
      removed_dependencies: dependencies.filter((item) => item.status === 'removed').length,
    },
  };
}
