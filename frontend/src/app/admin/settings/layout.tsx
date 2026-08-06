'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/admin/settings/basic', label: '基本信息' },
  { href: '/admin/settings/navigation', label: '顶部导航' },
  { href: '/admin/settings/footer', label: '页脚设置' },
  { href: '/admin/settings/announce', label: '公告管理' },
  { href: '/admin/settings/display', label: '显示设置' },
  { href: '/admin/settings/features', label: '功能管理' },
  { href: '/admin/settings/moderation', label: '审核开关' },
  { href: '/admin/settings/seo', label: 'SEO 设置' },
  { href: '/admin/settings/notifications', label: '通知设置' },
  { href: '/admin/settings/email', label: '邮件模板' },
  { href: '/admin/settings/external-api', label: '外部 API' },
  { href: '/admin/settings/terms', label: '条款设置' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">站点设置</h1>
        <p className="text-sm text-surface-500 mt-1">配置站点身份、品牌色、顶部导航、通知与邮件模板</p>
      </div>
      <div className="flex gap-1 border-b border-surface-200">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              pathname === tab.href
                ? 'border-surface-900 text-surface-900 font-medium'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
