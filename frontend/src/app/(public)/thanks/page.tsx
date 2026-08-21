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
          <p>感谢 Anuken 与 Mindustry 开源项目贡献者，为玩家和创作者建立了持续发展的游戏与模组生态。</p>
          <p>感谢社区中的模组作者、地图作者、教程作者、服务器运营者，以及每一位认真讨论、测试资源和提交反馈的玩家。</p>
          <p>也感谢所有为 MDTBBS、MindAuth、MindFileList 与 LanLink 提供设计、开发、测试和运行支持的参与者。</p>
        </div>
      )}
    />
  );
}
