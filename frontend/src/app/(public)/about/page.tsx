import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import { resolveBrand } from '@/lib/theme/brand';
import { fetchPublicSettings } from '@/lib/settings/server';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

async function getBrand() {
  const settings = await fetchPublicSettings();
  return resolveBrand(settings);
}

export async function generateMetadata(): Promise<Metadata> {
  const [brand, locale] = await Promise.all([getBrand(), getRequestLocale()]);
  // Bare title — the root layout's `title.template` appends the site suffix.
  const title = translate(locale, 'about.metaTitle');
  const description = translate(locale, 'about.metaDescription', { site: brand.siteName });
  return {
    title,
    description,
    alternates: { canonical: '/about' },
    openGraph: { title, description, type: 'website', url: '/about' },
  };
}

export default async function AboutPage() {
  const [brand, locale] = await Promise.all([getBrand(), getRequestLocale()]);
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);

  return (
    <ConfiguredFooterPage
      eyebrow={t('about.eyebrow')}
      title={t('about.title')}
      settingKey="footer_about_content"
      fallback={(
        <div className="space-y-4">
          <p>{t('about.fallback1', { site: brand.siteName })}</p>
          <p>{t('about.fallback2')}</p>
        </div>
      )}
    />
  );
}
