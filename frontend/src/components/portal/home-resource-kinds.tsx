import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { HomeResourceKind } from '@/lib/api/v1/home';

/** Resource kinds with real content, in the same order as the resource sidebar. */
export default function HomeResourceKinds({ kinds, title }: { kinds: HomeResourceKind[]; title: string }) {
  if (!kinds.length) return null;

  return <section>
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
      <Link href="/resources" className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--primary-text)] hover:underline">全部资源 <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
    </div>
    <ul className="flex flex-wrap gap-2">
      {kinds.map((kind) => <li key={kind.kind}>
        <Link href={`/resources?resource_kind=${kind.kind}`} className="inline-flex min-h-9 items-center gap-2 border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-text)]">
          {kind.label}<span className="text-xs tabular-nums text-[var(--text-muted)]">{kind.count}</span>
        </Link>
      </li>)}
    </ul>
  </section>;
}
