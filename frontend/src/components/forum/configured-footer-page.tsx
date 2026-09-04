import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { fetchPublicSettings } from '@/lib/settings/server';
import { unstable_noStore as noStore } from 'next/cache';

interface ConfiguredFooterPageProps {
  eyebrow: string;
  title: string;
  settingKey: string;
  fallback: React.ReactNode;
}

function toAnchorId(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[\s-]+/g, '-') || 'section';
}

function getTableOfContents(content: string): Array<{ title: string; id: string }> {
  return content.split('\n')
    .map((line) => line.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim())
    .filter((title): title is string => Boolean(title))
    .map((title) => ({ title, id: toAnchorId(title) }));
}

export default async function ConfiguredFooterPage({
  eyebrow,
  title,
  settingKey,
  fallback,
}: ConfiguredFooterPageProps) {
  // At build time the loopback API is intentionally skipped, which used to
  // bake the fallback text into these otherwise static routes. These pages
  // are admin-authored, so always resolve their current setting at request time.
  noStore();
  const settings = await fetchPublicSettings({ fresh: true });
  const content = settings[settingKey]?.trim();
  const renderedContent = content?.replace(/^#\s+/gm, '## ') || '';
  const tableOfContents = getTableOfContents(renderedContent);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-60">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">{title}</h1>
        <div className={tableOfContents.length > 1 ? 'mt-8 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10' : 'mt-6'}>
          {tableOfContents.length > 1 && (
            <aside className="mb-6 lg:mb-0">
              <details className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 lg:sticky lg:top-24 lg:block lg:border-0 lg:bg-transparent lg:p-0" open>
                <summary className="cursor-pointer text-sm font-semibold text-[var(--text)] lg:list-none">本页目录</summary>
                <nav aria-label="本页目录" className="mt-3 space-y-2 border-l border-[var(--border)] pl-3">
                  {tableOfContents.map((item, index) => <a key={`${item.id}-${index}`} href={`#${item.id}`} className="block text-sm leading-5 text-[var(--text-muted)] hover:text-[var(--primary)]">{item.title}</a>)}
                </nav>
              </details>
            </aside>
          )}
          <div className="max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            {content ? <MarkdownRenderer content={renderedContent} /> : fallback}
          </div>
        </div>
      </div>
    </div>
  );
}
