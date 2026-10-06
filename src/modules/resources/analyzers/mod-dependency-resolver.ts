import { satisfiesVersionRange } from './version-constraint.util';

export type ModDependencyKind = 'required' | 'optional' | 'incompatible' | 'embedded';
export type ModDependency = {
  mod_id: string;
  kind: ModDependencyKind;
  version_constraint?: string | null;
  upstream_url?: string | null;
};
export type ModRelease = { mod_id: string; title: string; version: string; dependencies: ModDependency[] };
export type DependencyResolverLimits = { max_depth?: number; max_nodes?: number };
export type ResolvedDependency = {
  mod_id: string;
  title: string | null;
  version: string | null;
  kind: ModDependencyKind;
  status: 'resolved' | 'unresolved' | 'version_mismatch' | 'embedded' | 'cycle' | 'limit_reached';
  constraint: string | null;
  children: ResolvedDependency[];
};

export type DependencyResolution = {
  root_mod_id: string;
  direct: ResolvedDependency[];
  tree: ResolvedDependency[];
  unresolved: Array<{ mod_id: string; kind: ModDependencyKind; constraint: string | null; upstream_url: string | null }>;
  cycles: string[][];
  warnings: string[];
  truncated: boolean;
};

function safeModId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
}

/**
 * Resolves a release graph without loading or executing any Mod code. Cycles are
 * retained as warnings and traversal is bounded by both depth and visited nodes.
 */
export function resolveModDependencies(
  root: ModRelease,
  catalog: ReadonlyMap<string, ModRelease>,
  limits: DependencyResolverLimits = {},
): DependencyResolution {
  const maxDepth = Math.max(1, Math.min(24, Math.trunc(limits.max_depth ?? 12)));
  const maxNodes = Math.max(1, Math.min(1000, Math.trunc(limits.max_nodes ?? 200)));
  const unresolved: DependencyResolution['unresolved'] = [];
  const cycles: string[][] = [];
  const warnings = new Set<string>();
  const expanded = new Set<string>([root.mod_id]);
  let nodesVisited = 0;
  let truncated = false;

  const visit = (release: ModRelease, depth: number, ancestors: string[]): ResolvedDependency[] => {
    const entries = Array.isArray(release.dependencies) ? release.dependencies.slice(0, 200) : [];
    const results: ResolvedDependency[] = [];
    for (const dependency of entries) {
      if (!dependency || !safeModId(dependency.mod_id) || !['required', 'optional', 'incompatible', 'embedded'].includes(dependency.kind)) {
        warnings.add('invalid_dependency');
        continue;
      }
      if (nodesVisited >= maxNodes || depth >= maxDepth) {
        truncated = true;
        warnings.add('resolver_limit_reached');
        results.push({ mod_id: dependency.mod_id, title: null, version: null, kind: dependency.kind, status: 'limit_reached', constraint: dependency.version_constraint || null, children: [] });
        continue;
      }
      nodesVisited += 1;
      const constraint = dependency.version_constraint?.trim() || null;
      if (dependency.kind === 'embedded') {
        results.push({ mod_id: dependency.mod_id, title: dependency.mod_id, version: null, kind: dependency.kind, status: 'embedded', constraint, children: [] });
        continue;
      }
      const cycleAt = ancestors.indexOf(dependency.mod_id);
      if (cycleAt >= 0 || dependency.mod_id === root.mod_id) {
        const cycle = [...ancestors.slice(Math.max(0, cycleAt)), dependency.mod_id];
        cycles.push(cycle);
        warnings.add('dependency_cycle');
        results.push({ mod_id: dependency.mod_id, title: dependency.mod_id === root.mod_id ? root.title : null, version: dependency.mod_id === root.mod_id ? root.version : null, kind: dependency.kind, status: 'cycle', constraint, children: [] });
        continue;
      }
      const target = catalog.get(dependency.mod_id);
      if (!target) {
        unresolved.push({ mod_id: dependency.mod_id, kind: dependency.kind, constraint, upstream_url: dependency.upstream_url || null });
        results.push({ mod_id: dependency.mod_id, title: null, version: null, kind: dependency.kind, status: 'unresolved', constraint, children: [] });
        continue;
      }
      if (dependency.kind === 'incompatible') {
        results.push({ mod_id: target.mod_id, title: target.title, version: target.version, kind: dependency.kind, status: 'resolved', constraint, children: [] });
        continue;
      }
      if (constraint && !satisfiesVersionRange(target.version, constraint)) {
        results.push({ mod_id: target.mod_id, title: target.title, version: target.version, kind: dependency.kind, status: 'version_mismatch', constraint, children: [] });
        continue;
      }
      const canExpand = !expanded.has(target.mod_id);
      if (canExpand) expanded.add(target.mod_id);
      results.push({
        mod_id: target.mod_id,
        title: target.title,
        version: target.version,
        kind: dependency.kind,
        status: 'resolved',
        constraint,
        children: canExpand ? visit(target, depth + 1, [...ancestors, target.mod_id]) : [],
      });
    }
    if (release.dependencies?.length > 200) {
      truncated = true;
      warnings.add('dependency_count_limit_reached');
    }
    return results;
  };

  const direct = (root.dependencies || []).slice(0, 200).flatMap((dependency) => {
    // Reuse the same resolver path, but retain only a matching direct node.
    const resolved = visit({ ...root, dependencies: [dependency] }, 0, [root.mod_id]);
    return resolved;
  });
  const tree = direct;
  return { root_mod_id: root.mod_id, direct, tree, unresolved, cycles, warnings: [...warnings], truncated };
}
