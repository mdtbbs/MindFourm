import type { Metadata } from 'next';
import { translate } from '@/i18n';
import { getRequestLocale } from '@/i18n/server';
import LogicSearch from '@/components/forum/resources/logic-search';

/** Public schematic logic search. All interaction lives in the client island. */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return {
    title: translate(locale, 'logicSearch.metaTitle'),
    description: translate(locale, 'logicSearch.metaDescription'),
    alternates: { canonical: '/resources/logic' },
  };
}

export default async function ResourceLogicPage() {
  const locale = await getRequestLocale();
  return <div className="mx-auto min-w-0 max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">{translate(locale, 'logicSearch.title')}</h1>
    <LogicSearch />
  </div>;
}
