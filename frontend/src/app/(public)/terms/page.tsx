import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';

const DESCRIPTION = '使用本站时需遵守的服务条款与社区规则';

export async function generateMetadata(): Promise<Metadata> {
  // Bare title — the root layout's `title.template` appends the site suffix.
  return {
    title: '服务条款',
    description: DESCRIPTION,
    alternates: { canonical: '/terms' },
    openGraph: {
      title: '服务条款',
      description: DESCRIPTION,
      type: 'website',
      url: '/terms',
    },
  };
}

export default function TermsPage() {
  return (
    <ConfiguredFooterPage
      eyebrow="Terms"
      title="服务条款"
      settingKey="footer_terms_content"
      fallback={(
        <div className="space-y-4">
          <p>使用本站时，请遵守所在地法律法规、社区规则和基本讨论礼仪，不发布违法、侵权、恶意攻击或破坏社区秩序的内容。</p>
          <p>本页面当前为基础占位条款。正式服务条款可在后台「页面管理」中编辑。</p>
        </div>
      )}
    />
  );
}
