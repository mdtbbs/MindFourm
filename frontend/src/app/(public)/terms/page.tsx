import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import ClubLegalDocument from '@/components/forum/club-legal-document';
import { siteProfile } from '@/config/site-profile';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

const DESCRIPTION = '使用本站时需遵守的服务条款与社区规则';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const club = siteProfile.profile === 'mindustry-club';
  const title = club ? translate(locale, 'legal.terms.title') : '服务条款';
  const description = club ? title : DESCRIPTION;
  // Bare title — the root layout's `title.template` appends the site suffix.
  return {
    title,
    description,
    alternates: { canonical: '/terms' },
    openGraph: {
      title,
      description,
      type: 'website',
      url: '/terms',
    },
  };
}

export default async function TermsPage() {
  const locale = await getRequestLocale();
  const club = siteProfile.profile === 'mindustry-club';
  return (
    <ConfiguredFooterPage
      eyebrow={club ? 'Mindustry Club' : 'Terms'}
      title={club ? translate(locale, 'legal.terms.title') : '服务条款'}
      settingKey="footer_terms_content"
      preferFallback={club}
      fallback={(
        club ? <ClubLegalDocument document="terms" locale={locale} /> : <div className="space-y-4">
          <p>使用本站时，请遵守所在地法律法规、社区规则和基本讨论礼仪，不发布违法、侵权、恶意攻击或破坏社区秩序的内容。</p>
          <p>本页面当前为基础占位条款。正式服务条款可在后台「页面管理」中编辑。</p>
        </div>
      )}
    />
  );
}
