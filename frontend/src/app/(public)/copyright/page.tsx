import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const title = translate(locale, 'footer.takedown');
  return { title, description: title, alternates: { canonical: '/copyright' } };
}

export default async function PolicyPage() {
  if (siteProfile.profile !== 'mindustry-club') notFound();
  const locale = await getRequestLocale();
  const title = translate(locale, 'footer.takedown');
  return <ConfiguredFooterPage eyebrow="Mindustry Club" title={title} settingKey="footer_takedown_content" fallback={<p>This policy is temporarily unavailable.</p>} />;
}
