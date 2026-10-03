'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Award,
  FileText,
  History,
  Shield,
  UserRound,
  X,
} from 'lucide-react';
import { adminApi, adminReportApi, userApi, type AdminReport } from '@/lib/api/client';
import type { AdminLog, User, UserProfile, UserRole } from '@/types';
import Button from '@/components/ui/button';
import Alert from '@/components/ui/alert';
import Pagination from '@/components/ui/pagination';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import { roleLabel } from '@/lib/display-labels';
import { promptDialog } from '@/store/interaction-dialog-store';

const PAGE_SIZE = 20;

type DetailTab = 'overview' | 'community' | 'gamification' | 'safety' | 'activity';

const roleOptions: Array<{ value: Exclude<UserRole, 'guest'>; label: string }> = [
  { value: 'user', label: '用户' },
  { value: 'moderator', label: '版主' },
  { value: 'admin', label: '管理员' },
];

function userDisplayName(user: Pick<User, 'id' | 'username'> | UserProfile): string {
  return user.username || `用户 #${user.id}`;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get('search') ?? '';
  const initialOpen = Number(searchParams?.get('open') || 0) || null;

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const currentPage = Number(searchParams?.get('page')) || 1;
  const [search, setSearch] = useState(initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  const [selectedId, setSelectedId] = useState<number | null>(initialOpen);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [activityLogs, setActivityLogs] = useState<AdminLog[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getUsers({
        page: currentPage,
        limit: PAGE_SIZE,
        search: searchQuery || undefined,
      });
      setUsers(result.data);
      setTotalPages(result.pagination.totalPages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载用户失败');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!selectedId) {
      setProfile(null);
      setActivityLogs([]);
      setReports([]);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setActionError(null);

    const load = async () => {
      const [profileResult, logsResult, reportsResult] = await Promise.allSettled([
        userApi.getById(selectedId),
        adminApi.getLogs({ page: 1, limit: 50 }),
        adminReportApi.list({ target_type: 'user', page: 1, limit: 50 }),
      ]);

      if (cancelled) return;

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        setProfile(null);
        setActionError('无法加载用户详情');
      }

      if (logsResult.status === 'fulfilled') {
        setActivityLogs(
          logsResult.value.data.filter(
            (log) => log.target_type === 'user' && log.target_id === selectedId,
          ),
        );
      } else {
        setActivityLogs([]);
      }

      if (reportsResult.status === 'fulfilled') {
        setReports(
          reportsResult.value.data.filter(
            (report) => report.target_type === 'user' && report.target_id === selectedId,
          ),
        );
      } else {
        setReports([]);
      }

      setProfileLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedRow = useMemo(
    () => users.find((user) => user.id === selectedId) ?? null,
    [selectedId, users],
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const next = search.trim();
    setSearchQuery(next);
    router.push(next ? `/admin/users?search=${encodeURIComponent(next)}` : '/admin/users');
  };

  const updateRole = async (role: Exclude<UserRole, 'guest'>) => {
    if (!selectedId || !profile || profile.role === role || updatingRole) return;

    const expected = profile.username || String(profile.id);
    const typed = await promptDialog({
      title: '确认修改用户角色',
      message: `这是权限变更操作。请输入名称以确认将 ${userDisplayName(profile)} 的角色改为「${roleLabel(role)}」。`,
      label: `请输入：${expected}`,
      required: true,
      validate: (value) => value === expected ? null : '输入内容不匹配',
      submitLabel: '修改角色',
    });
    if (typed !== expected) return;

    setUpdatingRole(true);
    setActionError(null);

    try {
      const updated = await adminApi.updateUserRole(selectedId, role);
      setProfile((current) => current ? { ...current, role: updated.role } : current);
      setUsers((current) => current.map((user) => user.id === selectedId ? { ...user, role: updated.role } : user));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '角色更新失败');
    } finally {
      setUpdatingRole(false);
    }
  };

  if (loading && users.length === 0) {
    return <InlineLoading label="正在加载用户" className="min-h-64" />;
  }

  if (error && users.length === 0) {
    return <ErrorState title="用户加载失败" description={error} onRetry={fetchUsers} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900">用户管理</h1>
          <p className="mt-1 text-sm text-surface-500">列表只保留识别和筛选信息，管理动作集中到用户详情。</p>
        </div>
        <form onSubmit={submitSearch} className="flex min-w-[280px] max-w-xl flex-1 gap-2 sm:flex-none">
          <input
            className="min-w-0 flex-1 border border-surface-200 bg-white px-3 py-2 text-sm sm:w-72"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="用户名、邮箱或 ID"
          />
          <Button type="submit" size="sm">搜索</Button>
          {searchQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setSearchQuery('');
                router.push('/admin/users');
              }}
            >
              清除
            </Button>
          ) : null}
        </form>
      </div>

      {error && users.length > 0 ? <Alert type="error" message={error} /> : null}
      {loading && users.length > 0 ? <InlineLoading label="正在刷新用户" /> : null}

      <div className="overflow-x-auto border border-surface-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-surface-200 bg-surface-50 text-left text-xs text-surface-500">
            <tr>
              <th className="px-4 py-3 font-medium">用户</th>
              <th className="px-4 py-3 font-medium">邮箱</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">验证</th>
              <th className="px-4 py-3 font-medium">注册时间</th>
              <th className="px-4 py-3 font-medium">MindAuth</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {users.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer hover:bg-surface-50"
                onClick={() => {
                  setSelectedId(user.id);
                  setDetailTab('overview');
                }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-surface-100 text-xs font-semibold text-surface-500">
                        {(user.username || String(user.id)).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-surface-900">{userDisplayName(user)}</div>
                      <div className="font-mono text-[10px] text-surface-400">#{user.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-surface-600">{user.email || '—'}</td>
                <td className="px-4 py-3">
                  <span className="border border-surface-200 px-2 py-1 text-xs text-surface-700">{roleLabel(user.role)}</span>
                </td>
                <td className="px-4 py-3 text-xs text-surface-500">{user.phone_verified ? '手机已验证' : '未验证 / 未提供'}</td>
                <td className="px-4 py-3 font-mono text-xs text-surface-500">{new Date(user.createdAt).toLocaleDateString('zh-CN')}</td>
                <td className="px-4 py-3 font-mono text-xs text-surface-500">{user.mindauthId}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-600 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(user.id);
                      setDetailTab('overview');
                    }}
                  >
                    查看详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-surface-400">没有符合条件的用户。</div>
        ) : null}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/admin/users"
        queryParams={searchQuery ? { search: searchQuery } : {}}
      />

      {selectedId ? (
        <>
          <button
            type="button"
            className="admin-v2-drawer-backdrop"
            aria-label="关闭用户详情"
            onClick={() => setSelectedId(null)}
          />
          <aside className="admin-v2-drawer" aria-label="用户详情">
            <div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-surface-200 bg-white px-5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-surface-900">
                  {profile ? userDisplayName(profile) : selectedRow ? userDisplayName(selectedRow) : `用户 #${selectedId}`}
                </div>
                <div className="font-mono text-[10px] text-surface-400">USER #{selectedId}</div>
              </div>
              <button type="button" className="p-2 text-surface-500 hover:bg-surface-50" onClick={() => setSelectedId(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {actionError ? <div className="p-4"><Alert type="error" message={actionError} /></div> : null}
            {profileLoading && !profile ? <InlineLoading label="正在加载用户详情" className="min-h-36" /> : null}

            {profile ? (
              <>
                <div className="border-b border-surface-200 px-5 py-5">
                  <div className="flex items-start gap-4">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-surface-100 text-lg font-semibold text-surface-500">
                        {(profile.username || String(profile.id)).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold text-surface-900">{userDisplayName(profile)}</div>
                      <div className="mt-1 text-sm text-surface-500">{profile.email || '未提供邮箱'}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="border border-surface-200 px-2 py-1 text-[10px]">{roleLabel(profile.role)}</span>
                        {profile.level ? <span className="border border-surface-200 px-2 py-1 text-[10px]">{profile.level.name}</span> : null}
                      </div>
                    </div>
                  </div>
                </div>

                <nav className="flex overflow-x-auto border-b border-surface-200 px-3">
                  {[
                    ['overview', '概览'],
                    ['community', '社区内容'],
                    ['gamification', '积分与徽章'],
                    ['safety', '安全与处罚'],
                    ['activity', '管理记录'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDetailTab(key as DetailTab)}
                      className={`border-b-2 px-3 py-3 text-xs whitespace-nowrap ${detailTab === key ? 'border-primary-500 font-semibold text-surface-900' : 'border-transparent text-surface-500'}`}
                    >
                      {label}
                    </button>
                  ))}
                </nav>

                <div className="p-5">
                  {detailTab === 'overview' ? (
                    <div className="space-y-5">
                      <section className="border border-surface-200">
                        <div className="border-b border-surface-200 px-4 py-3 text-xs font-semibold text-surface-700">账号资料</div>
                        <dl className="divide-y divide-surface-100 text-sm">
                          <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-surface-500">用户 ID</dt><dd className="font-mono text-xs">#{profile.id}</dd></div>
                          <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-surface-500">MindAuth ID</dt><dd className="font-mono text-xs">{profile.mindauth_id}</dd></div>
                          <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-surface-500">注册时间</dt><dd className="font-mono text-xs">{new Date(profile.created_at).toLocaleString('zh-CN')}</dd></div>
                          <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-surface-500">最近公开地区</dt><dd>{profile.last_location_label || '—'}</dd></div>
                        </dl>
                      </section>

                      <section className="border border-surface-200">
                        <div className="border-b border-surface-200 px-4 py-3 text-xs font-semibold text-surface-700">角色与权限</div>
                        <div className="p-4">
                          <p className="mb-3 text-xs leading-5 text-surface-500">权限变更属于敏感操作，提交前必须输入用户名确认。</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {roleOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                disabled={updatingRole || profile.role === option.value}
                                onClick={() => void updateRole(option.value)}
                                className={`border px-3 py-2 text-xs ${profile.role === option.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-200 hover:bg-surface-50'} disabled:cursor-default`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {detailTab === 'community' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 border border-surface-200">
                        <div className="border-r border-surface-200 p-4">
                          <FileText className="h-4 w-4 text-surface-400" />
                          <div className="mt-3 text-2xl font-semibold">{profile.post_count}</div>
                          <div className="text-xs text-surface-500">主题</div>
                        </div>
                        <div className="p-4">
                          <UserRound className="h-4 w-4 text-surface-400" />
                          <div className="mt-3 text-2xl font-semibold">{profile.reply_count}</div>
                          <div className="text-xs text-surface-500">回复</div>
                        </div>
                      </div>
                      <Link href={`/users/${profile.id}`} target="_blank" className="text-xs font-medium text-primary-600 hover:underline">
                        打开公开主页 →
                      </Link>
                    </div>
                  ) : null}

                  {detailTab === 'gamification' ? (
                    <div className="space-y-5">
                      <section className="border border-surface-200">
                        <div className="border-b border-surface-200 px-4 py-3 text-xs font-semibold text-surface-700">等级与积分</div>
                        <div className="grid grid-cols-2">
                          <div className="border-r border-surface-200 p-4">
                            <div className="text-xs text-surface-500">等级</div>
                            <div className="mt-2 font-medium">{profile.level?.name || '—'}</div>
                          </div>
                          <div className="p-4">
                            <div className="text-xs text-surface-500">累计积分</div>
                            <div className="mt-2 font-mono">{profile.total_points ?? '—'}</div>
                          </div>
                        </div>
                      </section>
                      <section>
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-surface-700"><Award className="h-4 w-4" />徽章</div>
                        <div className="flex flex-wrap gap-2">
                          {(profile.badges ?? []).map((badge) => (
                            <span key={badge.id} className="border border-surface-200 px-2 py-1 text-xs">{badge.name}</span>
                          ))}
                          {(profile.badges ?? []).length === 0 ? <span className="text-xs text-surface-400">暂无徽章</span> : null}
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {detailTab === 'safety' ? (
                    <div className="space-y-5">
                      <section className="border border-surface-200">
                        <div className="flex items-center gap-2 border-b border-surface-200 px-4 py-3 text-xs font-semibold text-surface-700">
                          <Shield className="h-4 w-4" />账号状态
                        </div>
                        <dl className="divide-y divide-surface-100 text-sm">
                          <div className="flex justify-between px-4 py-3"><dt className="text-surface-500">手机验证</dt><dd>{selectedRow?.phone_verified ? '已验证' : '未验证 / 未提供'}</dd></div>
                          <div className="flex justify-between px-4 py-3"><dt className="text-surface-500">用户举报</dt><dd>{reports.length}</dd></div>
                        </dl>
                      </section>
                      <div>
                        <div className="mb-2 text-xs font-semibold text-surface-700">相关举报</div>
                        <div className="divide-y divide-surface-100 border border-surface-200">
                          {reports.map((report) => (
                            <div key={report.id} className="px-4 py-3 text-xs">
                              <div className="flex justify-between gap-3">
                                <span className="font-medium text-surface-800">{report.reason}</span>
                                <span className="text-surface-400">{report.status}</span>
                              </div>
                              {report.detail ? <p className="mt-1 line-clamp-2 text-surface-500">{report.detail}</p> : null}
                            </div>
                          ))}
                          {reports.length === 0 ? <div className="px-4 py-8 text-center text-xs text-surface-400">暂无针对该用户的举报记录</div> : null}
                        </div>
                      </div>
                      <Link href="/admin/system/bans" className="text-xs font-medium text-primary-600 hover:underline">前往封禁管理 →</Link>
                    </div>
                  ) : null}

                  {detailTab === 'activity' ? (
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-surface-700"><History className="h-4 w-4" />最近管理记录</div>
                      <div className="divide-y divide-surface-100 border border-surface-200">
                        {activityLogs.map((log) => (
                          <div key={log.id} className="px-4 py-3">
                            <div className="text-xs font-medium text-surface-800">{log.action}</div>
                            <div className="mt-1 text-[10px] text-surface-400">{new Date(log.created_at).toLocaleString('zh-CN')}</div>
                            {log.details ? <div className="mt-1 text-xs text-surface-500">{log.details}</div> : null}
                          </div>
                        ))}
                        {activityLogs.length === 0 ? <div className="px-4 py-8 text-center text-xs text-surface-400">最近 50 条后台日志中没有该用户的管理记录</div> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </aside>
        </>
      ) : null}
    </div>
  );
}
