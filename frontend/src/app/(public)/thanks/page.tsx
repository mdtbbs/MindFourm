import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';

const DESCRIPTION = '感谢为 Mindustry 社区做出贡献的模组作者、地图作者、教程作者、服务器运营者与每一位参与者';

export async function generateMetadata(): Promise<Metadata> {
  // Bare title — the root layout's `title.template` appends the site suffix.
  return {
    title: '鸣谢',
    description: DESCRIPTION,
    alternates: { canonical: '/thanks' },
    openGraph: {
      title: '鸣谢',
      description: DESCRIPTION,
      type: 'website',
      url: '/thanks',
    },
  };
}

export default function ThanksPage() {
  return (
    <ConfiguredFooterPage
      eyebrow="Thanks"
      title="鸣谢"
      settingKey="footer_thanks_content"
      fallback={(
        <div className="space-y-4">
          <p>感谢 Mindustry 原作者、开源生态维护者、社区资源作者、服务器运营者，以及每一位参与讨论和反馈的玩家。</p>
          <p>本页面当前为占位说明。正式鸣谢内容可在后台「页面管理」中编辑。</p>
        </div>
      )}
    />
  );
}
