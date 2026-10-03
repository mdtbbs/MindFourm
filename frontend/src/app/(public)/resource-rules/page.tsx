import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import ClubLegalDocument from '@/components/forum/club-legal-document';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const title = translate(locale, 'legal.resourceRules.title');
  return { title, description: title, alternates: { canonical: '/resource-rules' } };
}

export default async function PolicyPage() {
  if (siteProfile.profile !== 'mindustry-club') notFound();
  const locale = await getRequestLocale();
  const title = translate(locale, 'legal.resourceRules.title');
  return <ConfiguredFooterPage eyebrow="Mindustry Club" title={title} settingKey="footer_resource_rules_content" preferFallback fallback={<ClubLegalDocument document="resourceRules" locale={locale} />} />;
}
