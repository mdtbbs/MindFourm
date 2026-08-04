'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';

const PAGES = [
  {
    key: 'about',
    title: '关于我们',
    description: '/about 页面',
    settingKey: 'footer_about_content',
  },
  {
    key: 'terms',
    title: '服务条款',
    description: '/terms 页面',
    settingKey: 'footer_terms_content',
  },
  {
    key: 'privacy',
    title: '隐私政策',
    description: '/privacy 页面',
    settingKey: 'footer_privacy_content',
  },
  {
    key: 'thanks',
    title: '鸣谢',
    description: '/thanks 页面',
    settingKey: 'footer_thanks_content',
  },
];

export default function PagesListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">页面管理</h1>
        <p className="text-sm text-surface-500 mt-1">
          管理站点的静态页面内容，支持 Markdown 格式
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PAGES.map((page) => (
          <Link
            key={page.key}
            href={`/admin/content/pages/${page.key}`}
            className="block p-6 bg-white border border-surface-200 rounded-lg hover:border-surface-400 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 bg-surface-100 rounded">
                <FileText className="w-6 h-6 text-surface-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-surface-900">{page.title}</h2>
                <p className="text-sm text-surface-500 mt-1">{page.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
