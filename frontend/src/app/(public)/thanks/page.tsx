import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import { resolveBrand } from '@/lib/theme/brand';
import { fetchPublicSettings } from '@/lib/settings/server';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const title = translate(locale, 'thanks.metaTitle');
  const description = translate(locale, 'thanks.metaDescription');
  return {
    title,
    description,
    alternates: { canonical: '/thanks' },
    openGraph: { title, description, type: 'website', url: '/thanks' },
  };
}

export default async function ThanksPage() {
  const [settings, locale] = await Promise.all([fetchPublicSettings(), getRequestLocale()]);
  const siteName = resolveBrand(settings).siteName;
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);

  return (
    <ConfiguredFooterPage
      eyebrow={t('thanks.eyebrow')}
      title={t('thanks.title')}
      settingKey="footer_thanks_content"
      fallback={(
        <div className="space-y-4">
          <p>{t('thanks.fallback1')}</p>
          <p>{t('thanks.fallback2')}</p>
          <p>{t('thanks.fallback3', { site: siteName })}</p>
        </div>
      )}
    />
  );
}
