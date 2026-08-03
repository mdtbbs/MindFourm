import ConfiguredFooterPage from '@/components/forum/configured-footer-page';

export default function TermsPage() {
  return (
    <ConfiguredFooterPage
      eyebrow="Terms"
      title="服务条款"
      settingKey="footer_terms_content"
      fallback={(
        <div className="space-y-4">
          <p>使用本站时，请遵守所在地法律法规、社区规则和基本讨论礼仪，不发布违法、侵权、恶意攻击或破坏社区秩序的内容。</p>
          <p>本页面当前为基础占位条款。正式服务条款可在后台「页脚设置」中配置。</p>
        </div>
      )}
    />
  );
}
