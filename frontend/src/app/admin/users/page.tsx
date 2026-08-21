'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { User, UserRole } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import Pagination from '@/components/ui/pagination';
import ErrorState from '@/components/ui/error-state';
import InlineLoading from '@/components/ui/inline-loading';
import { roleLabel } from '@/lib/display-labels';

const PAGE_SIZE = 20;

const roleVariant: Record<UserRole, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  guest: 'default',
  user: 'primary',
  moderator: 'warning',
  admin: 'danger',
};

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'user', label: '用户' },
  { value: 'moderator', label: '版主' },
  { value: 'admin', label: '管理员' },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updating, setUpdating] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getUsers({ page, limit: PAGE_SIZE, search: searchQuery || undefined });
      setUsers(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载用户失败');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: number, role: UserRole) => {
    setUpdating(userId);
    setUpdateError(null);
    try {
      const narrowedRole = role === 'guest' ? 'user' : role;
      const updated = await adminApi.updateUserRole(userId, narrowedRole);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdating(null);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(search);
    setPage(1);
  };

  if (loading && users.length === 0) {
    return <InlineLoading label="正在加载用户" className="min-h-64" />;
  }

  if (error && users.length === 0) {
    return (
      <ErrorState
        title="用户加载失败"
        description={error}
        onRetry={fetchUsers}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">用户管理</h1>
        <p className="text-sm text-surface-500 mt-1">
          查看和管理注册用户及其角色。
        </p>
        <form onSubmit={handleSearch} className="flex gap-2 mt-4">
          <input
            className="px-3 py-2 border border-surface-200 rounded text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索用户名或邮箱..."
          />
          <Button type="submit" size="sm">
            搜索
          </Button>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSearchQuery(''); setPage(1); }}>
              清除
            </Button>
          )}
        </form>
      </div>

      {updateError && <Alert type="error" message={updateError} />}
      {loading && users.length > 0 ? <InlineLoading label="正在刷新用户" /> : null}
      {error && users.length > 0 ? <Alert type="error" message={error} /> : null}

      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-surface-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">用户名</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">邮箱</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">角色</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">MindAuth ID</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">创建时间</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 text-surface-500">{user.id}</td>
                  <td className="px-4 py-3 font-medium text-surface-900">{user.username}</td>
                  <td className="px-4 py-3 text-surface-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={roleVariant[user.role]}>{roleLabel(user.role)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-surface-500">{user.mindauthId}</td>
                  <td className="px-4 py-3 text-surface-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-40">
                      <Select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                        options={roleOptions}
                        disabled={updating === user.id}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-12 text-surface-500">暂无用户。</div>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        basePath="/admin/users"
      />
    </div>
  );
}
