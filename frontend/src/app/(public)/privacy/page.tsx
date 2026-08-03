import ConfiguredFooterPage from '@/components/forum/configured-footer-page';

export default function PrivacyPage() {
  return (
    <ConfiguredFooterPage
      eyebrow="Privacy"
      title="隐私政策"
      settingKey="footer_privacy_content"
      fallback={(
        <div className="space-y-4">
          <p>本站会为登录、发帖、回复、通知和安全风控等功能处理必要的账户与操作数据，并尽量减少不必要的数据收集。</p>
          <p>本页面当前为基础占位说明。正式隐私政策可在后台「页脚设置」中配置。</p>
        </div>
      )}
    />
  );
}
