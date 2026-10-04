import { Boxes, Map as MapIcon, Package, Puzzle } from 'lucide-react';

const CATEGORIES = [
  { kind: 'mod', Icon: Puzzle },
  { kind: 'schematic', Icon: Boxes },
  { kind: 'map', Icon: MapIcon },
  { kind: 'pack', Icon: Package },
] as const;

export type ResourceCategoryKind = (typeof CATEGORIES)[number]['kind'];

export default function ResourceCategoryNavigation({
  labels,
  selectedKind,
  ariaLabel,
}: {
  labels: Record<ResourceCategoryKind, string>;
  selectedKind?: string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CATEGORIES.map(({ kind, Icon }) => {
        const selected = selectedKind === kind;
        return (
          <a
            key={kind}
            href={`/resources?resource_kind=${kind}`}
            aria-current={selected ? 'page' : undefined}
            data-resource-kind={kind}
            className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${selected
              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
              : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--primary)]/60 hover:text-[var(--primary)]'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="font-semibold">{labels[kind]}</span>
          </a>
        );
      })}
    </nav>
  );
}
