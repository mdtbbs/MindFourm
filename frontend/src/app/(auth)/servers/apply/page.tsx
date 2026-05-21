'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { serverApi } from '@/lib/api/client';
import { ServerVersion, ServerTemplate } from '@/types';
import { useAuth } from '@/lib/auth/context';
import { Server as ServerIcon, Send, Loader2 } from 'lucide-react';

export default function ApplyServerPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [templates, setTemplates] = useState<ServerTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    version: 'v146',
    template_id: 0
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    serverApi.getVersions().then(res => setVersions(res.versions || [])).catch(() => {});
    serverApi.getTemplates().then(res => setTemplates(res.templates || [])).catch(() => {});
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await serverApi.applyServer({
        name: form.name,
        description: form.description || undefined,
        version: form.version,
        template_id: form.template_id || undefined
      });

      if (result.server_id) {
        setSuccess(`服务器申请已提交（ID: ${result.server_id}），等待管理员审批`);
        setForm({ name: '', description: '', version: 'v146', template_id: 0 });
      } else {
        setError(result.message || '申请失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '申请失败');
    }
    setLoading(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-surface-500 dark:text-gray-400">请先登录后再申请服务器</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-gray-100 mb-6 flex items-center gap-2">
        <ServerIcon className="w-6 h-6" />
        申请服务器
      </h1>

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg border border-surface-200 dark:border-gray-700 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1">
            服务器名称 *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="我的服务器"
            required
            minLength={2}
            maxLength={50}
            className="w-full px-4 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-surface-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1">
            描述
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="服务器简介..."
            rows={3}
            maxLength={200}
            className="w-full px-4 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-surface-900 dark:text-gray-100 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1">
            版本 *
          </label>
          <select
            value={form.version}
            onChange={(e) => setForm({ ...form, version: e.target.value })}
            required
            className="w-full px-4 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-surface-900 dark:text-gray-100"
          >
            {versions.length === 0 ? (
              <option value="v146">v146 (正式版)</option>
            ) : (
              versions.map(v => (
                <option key={v.version} value={v.version}>
                  {v.version} {v.is_stable ? '(稳定版)' : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-gray-300 mb-1">
            模板（可选）
          </label>
          <select
            value={form.template_id}
            onChange={(e) => setForm({ ...form, template_id: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-surface-900 dark:text-gray-100"
          >
            <option value="0">无模板</option>
            {templates.filter(t => t.is_public).map(t => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.version})
              </option>
            ))}
          </select>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading || !form.name || !form.version}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:bg-surface-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            提交申请
          </button>
        </div>
      </form>

      <div className="mt-6 text-sm text-surface-500 dark:text-gray-400">
        <p className="mb-2">申请说明：</p>
        <ul className="list-disc list-inside space-y-1">
          <li>每个用户默认最多可申请 2 个服务器</li>
          <li>申请提交后需管理员审批</li>
          <li>审批通过后可在 EasyManager 管理面板操作服务器</li>
        </ul>
      </div>
    </div>
  );
}