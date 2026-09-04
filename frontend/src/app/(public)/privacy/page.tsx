import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';

const DESCRIPTION = '本站的数据收集、使用与保护说明';

export async function generateMetadata(): Promise<Metadata> {
  // Bare title — the root layout's `title.template` appends the site suffix.
  return {
    title: '隐私政策',
    description: DESCRIPTION,
    alternates: { canonical: '/privacy' },
    openGraph: {
      title: '隐私政策',
      description: DESCRIPTION,
      type: 'website',
      url: '/privacy',
    },
  };
}

export default function PrivacyPage() {
  return (
    <ConfiguredFooterPage
      eyebrow="Privacy"
      title="隐私政策"
      settingKey="footer_privacy_content"
      fallback={(
        <div className="space-y-4">
          <p>本站会为登录、发帖、回复、通知和安全风控等功能处理必要的账户与操作数据，并尽量减少不必要的数据收集。</p>
          <p>本页面当前为基础占位说明。正式隐私政策可在后台「页面管理」中编辑。</p>
        </div>
      )}
    />
  );
}
