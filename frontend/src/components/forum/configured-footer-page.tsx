import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { fetchPublicSettings } from '@/lib/settings/server';

interface ConfiguredFooterPageProps {
  eyebrow: string;
  title: string;
  settingKey: string;
  fallback: React.ReactNode;
}

export default async function ConfiguredFooterPage({
  eyebrow,
  title,
  settingKey,
  fallback,
}: ConfiguredFooterPageProps) {
  const settings = await fetchPublicSettings({ fresh: true });
  const content = settings[settingKey]?.trim();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 sm:p-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-60">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">{title}</h1>
        <div className="mt-6 text-sm leading-7 text-[var(--text-secondary)]">
          {content ? <MarkdownRenderer content={content} /> : fallback}
        </div>
      </div>
    </div>
  );
}
