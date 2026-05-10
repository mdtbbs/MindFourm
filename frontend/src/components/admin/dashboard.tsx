'use client';

import Link from 'next/link';
import { FileText, MessageSquare, Users, TrendingUp } from 'lucide-react';

const stats = [
  { label: '总帖子数', value: '--', icon: FileText, color: 'text-primary-600' },
  { label: '总回复数', value: '--', icon: MessageSquare, color: 'text-green-600' },
  { label: '总用户数', value: '--', icon: Users, color: 'text-yellow-600' },
  { label: '今日新增', value: '--', icon: TrendingUp, color: 'text-blue-600' },
];

export default function Dashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 mb-6">仪表盘</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-lg border border-surface-200 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-surface-500">{stat.label}</span>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-surface-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-surface-200 p-6">
        <h3 className="font-semibold text-surface-900 mb-4">快捷入口</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/admin/categories"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">分类管理</p>
          </Link>
          <Link
            href="/admin/users"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">用户管理</p>
          </Link>
          <Link
            href="/admin/posts"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">帖子管理</p>
          </Link>
          <Link
            href="/admin/logs"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">操作日志</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
