'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import { Server, Users, Trophy, ShoppingBag, FolderOpen } from 'lucide-react';

interface FeatureItem {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  routes: string[];
}

const features: FeatureItem[] = [
  {
    key: 'feature_resources_enabled',
    label: '资源中心',
    description: '允许用户浏览和下载社区资源（地图、模组等）',
    icon: FolderOpen,
    routes: ['/resources'],
  },
  {
    key: 'feature_servers_enabled',
    label: '游戏服务器',
    description: '展示社区游戏服务器列表，允许用户申请和管理服务器',
    icon: Server,
    routes: ['/servers'],
  },
  {
    key: 'feature_groups_enabled',
    label: '用户组',
    description: '展示社区用户组信息和成员列表',
    icon: Users,
    routes: ['/groups'],
  },
  {
    key: 'feature_leaderboard_enabled',
    label: '积分排行',
    description: '展示用户积分排行榜和活跃度排名',
    icon: Trophy,
    routes: ['/leaderboard'],
  },
  {
    key: 'feature_shop_enabled',
    label: '积分商店',
    description: '允许用户使用积分兑换商品和道具',
    icon: ShoppingBag,
    routes: ['/shop'],
  },
];

export default function FeaturesSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setValues(await adminApi.getSettings('features'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('features', values);
      await refreshAfterSettingsSave();
      setMessage('已保存');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: string, checked: boolean) => {
    setValues((prev) => ({ ...prev, [key]: checked ? 'true' : 'false' }));
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  const enabledCount = features.filter((f) => (values[f.key] ?? 'true') === 'true').length;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">功能管理</h2>
        <p className="text-xs text-surface-400 mt-1">
          控制前台快捷入口和功能模块的启用状态。关闭后，对应的入口将隐藏，相关页面和 API 也将停止服务。
        </p>
      </div>

      <div className="p-6 space-y-4">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div className="flex items-center justify-between border border-surface-200 bg-surface-50 px-4 py-3">
          <span className="text-sm text-surface-700">
            已启用 <span className="font-semibold">{enabledCount}</span> / {features.length} 个功能
          </span>
        </div>

        <div className="space-y-3">
          {features.map((feature) => {
            const isEnabled = (values[feature.key] ?? 'true') === 'true';
            const Icon = feature.icon;

            return (
              <div
                key={feature.key}
                className={`flex items-start gap-4 border p-4 transition-colors ${
                  isEnabled
                    ? 'border-surface-200 bg-white'
                    : 'border-surface-200 bg-surface-50 opacity-60'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border ${
                    isEnabled
                      ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                      : 'border-surface-200 bg-surface-100 text-surface-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-surface-800">{feature.label}</span>
                    <span
                      className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                        isEnabled
                          ? 'border-[rgba(34,197,94,0.25)] text-[#4caf50]'
                          : 'border-surface-200 text-surface-400'
                      }`}
                    >
                      {isEnabled ? '已启用' : '已关闭'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-surface-500">{feature.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {feature.routes.map((route) => (
                      <span
                        key={route}
                        className="border border-surface-200 bg-surface-50 px-1.5 py-0.5 font-mono text-[10px] text-surface-400"
                      >
                        {route}
                      </span>
                    ))}
                  </div>
                </div>

                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isEnabled}
                    onChange={(e) => toggle(feature.key, e.target.checked)}
                  />
                  <div className="peer h-6 w-11 border border-surface-200 bg-surface-100 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-surface-200 after:bg-white after:transition-all peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary-soft-strong)] peer-checked:after:translate-x-full peer-checked:after:border-[var(--primary)] peer-checked:after:bg-[var(--primary)]" />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>重置</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
      </div>
    </div>
  );
}
