'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';
import { Activity, Gamepad2, Network, Radio, Server, Shield, Users, Trophy, ShoppingBag, FolderOpen } from 'lucide-react';

interface FeatureItem {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  routes: string[];
  defaultEnabled?: boolean;
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
  {
    key: 'feature_social_presence_v1_enabled',
    label: '社交 Presence V1',
    description: '允许多客户端在线状态、好友 Presence 与社交隐私 API。',
    icon: Users,
    routes: ['/friends', '/api/v1/presence'],
    defaultEnabled: false,
  },
  {
    key: 'feature_rich_activity_v1_enabled',
    label: 'Rich Activity V1',
    description: '允许经审核的客户端上报并展示游戏与应用活动。',
    icon: Activity,
    routes: ['/friends'],
    defaultEnabled: false,
  },
  {
    key: 'feature_multiplayer_sessions_v1_enabled',
    label: '联机会话 V1',
    description: '开放私有、好友和未列出 Session 的创建、加入与 Peer 管理。',
    icon: Gamepad2,
    routes: ['/api/v1/multiplayer/sessions'],
    defaultEnabled: false,
  },
  {
    key: 'feature_multiplayer_invites_v1_enabled',
    label: '联机邀请与请求',
    description: '开放好友邀请、请求加入及房主审批。',
    icon: Radio,
    routes: ['/api/v1/multiplayer/invites'],
    defaultEnabled: false,
  },
  {
    key: 'feature_multiplayer_relay_v1_enabled',
    label: '官方 Relay 分配',
    description: '允许 Control Plane 为 Peer 签发官方中继分配凭证。',
    icon: Network,
    routes: ['/api/v1/multiplayer/sessions/{id}/relay'],
    defaultEnabled: false,
  },
  {
    key: 'feature_third_party_multiplayer_v1_enabled',
    label: '第三方 Multiplayer 客户端',
    description: '允许已审核并获批对应 scope 和客户端能力的第三方应用调用联机 API。',
    icon: Shield,
    routes: ['MindAuth Developer Applications'],
    defaultEnabled: false,
  },
];

export default function FeaturesSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges(values);
  const initializeUnsaved = unsaved.initialize;

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('features');
      setValues(data);
      initializeUnsaved(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [initializeUnsaved]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!unsaved.isDirty || unsaved.isSaving) return;
    const submittedValues = { ...values };
    unsaved.setSaving();
    try {
      await adminApi.updateSettings('features', submittedValues);
      await refreshAfterSettingsSave();
      unsaved.markSaved(submittedValues);
    } catch (err) {
      unsaved.setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const toggle = (key: string, checked: boolean) => {
    setValues((prev) => ({ ...prev, [key]: checked ? 'true' : 'false' }));
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  const enabledCount = features.filter((f) => (values[f.key] ?? (f.defaultEnabled === false ? 'false' : 'true')) === 'true').length;

  return (
    <div className={`bg-white border border-surface-200 ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">功能管理</h2>
        <p className="text-xs text-surface-400 mt-1">
          控制前台快捷入口和功能模块的启用状态。关闭后，对应的入口将隐藏，相关页面和 API 也将停止服务。
        </p>
      </div>

      <div className="p-6 space-y-4">
        {loadError && <Alert type="error" message={loadError} />}

        <div className="flex items-center justify-between border border-surface-200 bg-surface-50 px-4 py-3">
          <span className="text-sm text-surface-700">
            已启用 <span className="font-semibold">{enabledCount}</span> / {features.length} 个功能
          </span>
        </div>

        <div className="space-y-3">
          {features.map((feature) => {
            const isEnabled = (values[feature.key] ?? (feature.defaultEnabled === false ? 'false' : 'true')) === 'true';
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
                  <div className="peer h-6 w-11 border border-surface-200 bg-surface-100 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-surface-200 after:bg-white after:transition-[transform,background-color,border-color] after:duration-[var(--motion-fast)] peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary-soft-strong)] peer-checked:after:translate-x-full peer-checked:after:border-[var(--primary)] peer-checked:after:bg-[var(--primary)]" />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <SettingsUnsavedChangesBar
        dirty={unsaved.isDirty}
        saving={unsaved.isSaving}
        saved={unsaved.isSaved}
        error={unsaved.error}
        onDiscard={() => {
          const restored = unsaved.discard();
          if (restored) setValues(restored);
          setLoadError(null);
        }}
        onSave={() => { void handleSave(); }}
      />
    </div>
  );
}
