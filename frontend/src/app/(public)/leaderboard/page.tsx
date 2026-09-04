'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import Link from 'next/link';
import { Trophy, Medal, Star } from 'lucide-react';
import FeatureGate from '@/components/forum/feature-gate';

interface LeaderboardUser {
  id: number;
  username: string;
  avatar_url: string | null;
  total_points: number;
  role: string;
  rank: number;
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchLeaderboard = useCallback(async (p: number) => {
    try {
      const res = await api.get<{ data: LeaderboardUser[] }>(`/api/points/leaderboard?page=${p}&limit=20`);
      const data = res.data || [];
      if (p === 1) {
        setUsers(data);
      } else {
        setUsers((prev) => [...prev, ...data]);
      }
      setHasMore(data.length >= 20);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaderboard(page); }, [fetchLeaderboard, page]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-muted-foreground text-sm">{rank}</span>;
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, string> = {
      admin: 'bg-red-100 text-red-700',
      moderator: 'bg-blue-100 text-blue-700',
      core_user: 'bg-purple-100 text-purple-700',
      active_user: 'bg-green-100 text-green-700',
    };
    const labels: Record<string, string> = {
      admin: '管理员',
      moderator: '版主',
      core_user: '核心用户',
      active_user: '活跃用户',
    };
    if (!badges[role]) return null;
    return <span className={`text-xs px-2 py-0.5 rounded font-medium ${badges[role]}`}>{labels[role]}</span>;
  };

  return (
    <FeatureGate settingKey="feature_leaderboard_enabled" label="积分排行">
    <div>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary">首页</Link>
            <span>/</span>
            <span>积分排行榜</span>
          </nav>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Star className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">积分排行榜</h1>
        </div>

        {/* Top 3 podium */}
        {users.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[users[1], users[0], users[2]].map((u, i) => {
              const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
              const heights = ['h-20', 'h-28', 'h-16'];
              const colors = [
                'bg-gradient-to-t from-gray-200 to-gray-100',
                'bg-gradient-to-t from-yellow-200 to-yellow-100',
                'bg-gradient-to-t from-amber-200 to-amber-100',
              ];
              return (
                <div key={u.id} className="flex flex-col items-center">
                  <Link href={`/users/${u.id}`} className="flex flex-col items-center mb-2">
                    <img
                      src={u.avatar_url || '/default-avatar.png'}
                      alt={u.username}
                      className="w-14 h-14 rounded-full border-2 border-white shadow"
                    />
                    <span className="text-sm font-medium mt-2">{u.username}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      {u.total_points}
                    </span>
                  </Link>
                  <div className={`w-full ${heights[i]} ${colors[i]} rounded-t-lg flex items-start justify-center pt-2`}>
                    <span className="text-2xl font-bold opacity-50">#{rank}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <div className="card divide-y divide-border">
          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-4 px-5 py-3 hover:bg-accent/5 transition-colors">
                  <div className="w-8 flex justify-center">
                    {getRankIcon(u.rank)}
                  </div>
                  <Link href={`/users/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <img
                      src={u.avatar_url || '/default-avatar.png'}
                      alt={u.username}
                      className="w-9 h-9 rounded-full"
                    />
                    <span className="font-medium truncate">{u.username}</span>
                    {getRoleBadge(u.role)}
                  </Link>
                  <div className="flex items-center gap-1 text-sm font-semibold text-primary">
                    <Star className="w-4 h-4" />
                    {u.total_points}
                  </div>
                </div>
              ))}
              {hasMore && (
                <div className="px-5 py-4 text-center">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="btn btn-secondary text-sm"
                  >
                    加载更多
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
    </FeatureGate>
  );
}
