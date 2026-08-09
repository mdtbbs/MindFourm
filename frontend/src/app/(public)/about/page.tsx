import { Metadata } from 'next';
import ConfiguredFooterPage from '@/components/forum/configured-footer-page';
import { resolveBrand } from '@/lib/theme/brand';
import { fetchPublicSettings } from '@/lib/settings/server';

async function getBrand() {
  const settings = await fetchPublicSettings();
  return resolveBrand(settings);
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  // Bare title — the root layout's `title.template` appends the site suffix.
  const description = `${brand.siteName} — 交流玩法、发布资源、记录教程、连接同好`;
  return {
    title: '关于我们',
    description,
    alternates: { canonical: '/about' },
    openGraph: {
      title: '关于我们',
      description,
      type: 'website',
      url: '/about',
    },
  };
}

export default async function AboutPage() {
  const brand = await getBrand();

  return (
    <ConfiguredFooterPage
      eyebrow="About"
      title="关于我们"
      settingKey="footer_about_content"
      fallback={(
        <div className="space-y-4">
          <p>{brand.siteName} 是面向玩家与创作者的社区论坛，用于交流玩法、发布资源、记录教程和连接更多同好。</p>
          <p>这里会持续沉淀社区讨论、资源版本、服务器信息和玩家经验。正式的站点介绍文案可在后台「页面管理」中编辑。</p>
        </div>
      )}
    />
  );
}
