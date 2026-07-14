'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { UnifiedHeader } from '@mindproject/shared';
import Link from 'next/link';
import { Users, Hash, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import FeatureGate from '@/components/forum/feature-gate';

interface Group {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_system: number;
  member_count?: number;
}

export default function GroupsPage() {
  const { user, isAuthenticated } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<number | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const data = await api.get<Group[]>('/groups');
      setGroups(data || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleJoin = async (groupId: number) => {
    if (!isAuthenticated || !user) return;
    setJoining(groupId);
    try {
      await api.post(`/groups/${groupId}/join?userId=${user.id}`);
      await fetchGroups();
    } catch (err) {
      console.error('Failed to join group:', err);
    } finally {
      setJoining(null);
    }
  };

  if (loading) return (
    <FeatureGate settingKey="feature_groups_enabled" label="用户组">
    <div className="min-h-screen bg-[var(--bg)]">
      <UnifiedHeader />
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    </div>
    </FeatureGate>
  );

  return (
    <FeatureGate settingKey="feature_groups_enabled" label="用户组">
    <div className="min-h-screen bg-[var(--bg)]">
      <UnifiedHeader />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link href="/" className="hover:text-primary">首页</Link>
            <span>/</span>
            <span>用户组</span>
          </nav>
        </div>

        <h1 className="text-2xl font-bold mb-2">用户组</h1>
        <p className="text-muted mb-6">加入感兴趣的用户组，与其他成员交流互动</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div key={group.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                {group.icon ? (
                  <img src={group.icon} alt={group.name} className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: group.color || 'var(--primary)' }}
                  >
                    {group.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{group.name}</h3>
                    {group.is_system === 1 && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">官方</span>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-sm text-muted mt-1 line-clamp-2">{group.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {group.member_count || 0} 成员
                    </span>
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {group.slug}
                    </span>
                  </div>
                </div>
              </div>
              {isAuthenticated && (
                <button
                  onClick={() => handleJoin(group.id)}
                  disabled={joining === group.id}
                  className="mt-4 w-full btn btn-primary text-sm"
                >
                  {joining === group.id ? '加入中...' : '加入'}
                </button>
              )}
            </div>
          ))}
        </div>

        {groups.length === 0 && (
          <div className="text-center py-16 text-muted">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无用户组</p>
          </div>
        )}

        {!isAuthenticated && (
          <div className="mt-8 card p-6 text-center">
            <Lock className="w-8 h-8 mx-auto text-muted mb-2" />
            <p className="text-muted mb-3">请先登录后加入用户组</p>
            <a
              href={`/login?redirect=${encodeURIComponent('/groups')}`}
              className="btn btn-primary"
            >
              登录
            </a>
          </div>
        )}
      </main>
    </div>
    </FeatureGate>
  );
}
