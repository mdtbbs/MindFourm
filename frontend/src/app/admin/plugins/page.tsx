'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { Puzzle, Power, PowerOff, Trash2, Plus, Code } from 'lucide-react';

interface Plugin {
  id: number;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  is_installed: boolean;
  is_active: boolean;
  config: Record<string, any>;
  dependencies: string[];
  created_at: string;
  hook_count?: number;
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [formData, setFormData] = useState({ name: '', slug: '', version: '1.0.0', description: '', author: '' });

  const fetchPlugins = useCallback(async () => {
    try {
      const data = await adminApi.getPlugins();
      setPlugins(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载插件失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const handleAction = async (action: string, slug: string) => {
    setError(null);
    try {
      switch (action) {
        case 'enable': await adminApi.enablePlugin(slug); break;
        case 'disable': await adminApi.disablePlugin(slug); break;
        case 'uninstall': await adminApi.uninstallPlugin(slug); break;
      }
      setMessage(action === 'enable' ? '插件已启用' : action === 'disable' ? '插件已禁用' : '插件已卸载');
      setTimeout(() => setMessage(null), 3000);
      await fetchPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleInstall = async () => {
    if (!formData.name || !formData.slug) {
      setError('请填写插件名称和标识');
      return;
    }
    setInstalling(true);
    setError(null);
    try {
      await adminApi.installPlugin(formData);
      setMessage('插件安装成功');
      setTimeout(() => setMessage(null), 3000);
      setShowInstall(false);
      setFormData({ name: '', slug: '', version: '1.0.0', description: '', author: '' });
      await fetchPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : '安装失败');
    } finally {
      setInstalling(false);
    }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">插件管理</h1>
          <p className="text-sm text-surface-500 mt-1">管理论坛系统的扩展插件</p>
        </div>
        <Button onClick={() => setShowInstall(!showInstall)} variant="primary">
          <Plus className="w-4 h-4 mr-1" />
          安装插件
        </Button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Install form */}
      {showInstall && (
        <div className="bg-white border border-surface-200 rounded p-6">
          <h3 className="text-sm font-semibold mb-4">安装新插件</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">插件名称 *</label>
              <input
                className="w-full px-3 py-2 border border-surface-200 rounded text-sm"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：Markdown 增强"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">插件标识 *</label>
              <input
                className="w-full px-3 py-2 border border-surface-200 rounded text-sm"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="例如：markdown-plus"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">版本</label>
              <input
                className="w-full px-3 py-2 border border-surface-200 rounded text-sm"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="1.0.0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">作者</label>
              <input
                className="w-full px-3 py-2 border border-surface-200 rounded text-sm"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                placeholder="作者名"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">描述</label>
              <input
                className="w-full px-3 py-2 border border-surface-200 rounded text-sm"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="插件功能描述"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleInstall} disabled={installing} variant="primary">
              {installing ? '安装中...' : '确认安装'}
            </Button>
            <Button onClick={() => setShowInstall(false)} variant="secondary">
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Plugin list */}
      {plugins.length === 0 ? (
        <div className="bg-white border border-surface-200 rounded p-12 text-center">
          <Puzzle className="w-12 h-12 mx-auto text-surface-300 mb-4" />
          <h3 className="text-lg font-medium text-surface-700">暂无插件</h3>
          <p className="text-sm text-surface-500 mt-1">点击"安装插件"添加扩展功能</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="bg-white border border-surface-200 rounded p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded ${plugin.is_active ? 'bg-green-50 text-green-600' : 'bg-surface-100 text-surface-400'}`}>
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{plugin.name}</h3>
                      <span className="text-xs bg-surface-100 text-surface-500 px-2 py-0.5 rounded font-mono">
                        v{plugin.version}
                      </span>
                      {plugin.is_active ? (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded font-medium">已启用</span>
                      ) : (
                        <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded font-medium">已禁用</span>
                      )}
                    </div>
                    <p className="text-sm text-surface-500 mt-1">{plugin.description || '暂无描述'}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-400">
                      {plugin.author && <span>作者：{plugin.author}</span>}
                      <span>标识：{plugin.slug}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {plugin.is_active ? (
                    <Button size="sm" variant="secondary" onClick={() => handleAction('disable', plugin.slug)}>
                      <PowerOff className="w-3 h-3 mr-1" /> 禁用
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => handleAction('enable', plugin.slug)}>
                      <Power className="w-3 h-3 mr-1" /> 启用
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => handleAction('uninstall', plugin.slug)}>
                    <Trash2 className="w-3 h-3 mr-1" /> 卸载
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
