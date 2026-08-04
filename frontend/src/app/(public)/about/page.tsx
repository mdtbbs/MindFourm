import ConfiguredFooterPage from '@/components/forum/configured-footer-page';

export default function AboutPage() {
  return (
    <ConfiguredFooterPage
      eyebrow="About"
      title="关于我们"
      settingKey="footer_about_content"
      fallback={(
        <div className="space-y-4">
          <p>MindFourm 是面向 Mindustry 玩家与创作者的社区论坛，用于交流玩法、发布资源、记录教程和连接更多同好。</p>
          <p>这里会持续沉淀社区讨论、资源版本、服务器信息和玩家经验。正式的站点介绍文案可在后台「页面管理」中编辑。</p>
        </div>
      )}
    />
  );
}
