import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import ClubLegalDocument from '@/components/forum/club-legal-document';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const title = translate(locale, 'legal.communityGuidelines.title');
  return { title, description: title, alternates: { canonical: '/community-guidelines' } };
}

export default async function PolicyPage() {
  if (siteProfile.profile !== 'mindustry-club') notFound();
  const locale = await getRequestLocale();
  const title = translate(locale, 'legal.communityGuidelines.title');
  return <ConfiguredFooterPage eyebrow="Mindustry Club" title={title} settingKey="footer_community_guidelines_content" preferFallback fallback={<ClubLegalDocument document="communityGuidelines" locale={locale} />} />;
}
