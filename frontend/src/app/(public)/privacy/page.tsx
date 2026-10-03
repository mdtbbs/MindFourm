import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import ClubLegalDocument from '@/components/forum/club-legal-document';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

const DESCRIPTION = '本站的数据收集、使用与保护说明';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const club = siteProfile.profile === 'mindustry-club';
  const title = club ? translate(locale, 'legal.privacy.title') : '隐私政策';
  const description = club ? title : DESCRIPTION;
  // Bare title — the root layout's `title.template` appends the site suffix.
  return {
    title,
    description,
    alternates: { canonical: '/privacy' },
    openGraph: {
      title,
      description,
      type: 'website',
      url: '/privacy',
    },
  };
}

export default async function PrivacyPage() {
  const locale = await getRequestLocale();
  const club = siteProfile.profile === 'mindustry-club';
  return (
    <ConfiguredFooterPage
      eyebrow={club ? 'Mindustry Club' : 'Privacy'}
      title={club ? translate(locale, 'legal.privacy.title') : '隐私政策'}
      settingKey="footer_privacy_content"
      preferFallback={club}
      fallback={(
        club ? <ClubLegalDocument document="privacy" locale={locale} /> : <div className="space-y-4">
          <p>本站会为登录、发帖、回复、通知和安全风控等功能处理必要的账户与操作数据，并尽量减少不必要的数据收集。</p>
          <p>本页面当前为基础占位说明。正式隐私政策可在后台「页面管理」中编辑。</p>
        </div>
      )}
    />
  );
}
