import ConfiguredFooterPage from '@/components/forum/configured-footer-page';

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
