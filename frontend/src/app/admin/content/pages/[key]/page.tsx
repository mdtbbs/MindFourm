'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import MarkdownEditor from '@/components/ui/markdown-editor';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';

const PAGES: Record<string, { title: string; path: string; description: string }> = {
  about: { title: '关于我们', path: '/about', description: '介绍站点和社区的内容' },
  terms: { title: '服务条款', path: '/terms', description: '用户使用协议和规则' },
  privacy: { title: '隐私政策', path: '/privacy', description: '数据收集和使用说明' },
  thanks: { title: '鸣谢', path: '/thanks', description: '感谢贡献者和支持者' },
};

export default function PageEditPage() {
  const params = useParams();
  const router = useRouter();
  const pageKey = params.key as string;
  const pageInfo = PAGES[pageKey];

  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settingKey = pageInfo ? `footer_${pageKey}_content` : null;

  const fetchContent = useCallback(async () => {
    if (!settingKey) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getSettings('footer');
      setContent(data[settingKey] ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [settingKey]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleSave = async () => {
    if (!settingKey) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.updateSettings('footer', { [settingKey]: content });
      await refreshAfterSettingsSave();
      setMessage('保存成功');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!pageInfo) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded p-6">
          <h2 className="text-lg font-semibold text-red-900">页面不存在</h2>
          <p className="text-sm text-red-700 mt-2">找不到页面 "{pageKey}"</p>
          <Link href="/admin/content/pages" className="text-sm text-red-700 hover:underline mt-4 inline-block">
            ← 返回页面列表
          </Link>
        </div>
      </div>
    );
  }

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/content/pages"
          className="inline-flex items-center gap-2 text-sm text-surface-600 hover:text-surface-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回页面列表
        </Link>

        <h1 className="text-2xl font-bold text-surface-900">{pageInfo.title}</h1>
        <p className="text-sm text-surface-500 mt-1">
          <span className="font-mono text-xs bg-surface-100 px-2 py-1 rounded">{pageInfo.path}</span>
          {' - '}
          {pageInfo.description}
        </p>
      </div>

      <div className="bg-white border border-surface-200 rounded-lg">
        <div className="p-6 space-y-6">
          {message && <Alert type="success" message={message} />}
          {error && <Alert type="error" message={error} />}

          <MarkdownEditor
            value={content}
            onChange={setContent}
            label="页面内容（Markdown）"
            placeholder={`输入 ${pageInfo.title} 的内容，支持 Markdown 格式...`}
            rows={20}
          />
        </div>

        <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
          <Button variant="ghost" onClick={fetchContent}>重置</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
