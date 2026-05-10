'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { User, UserRole } from '@/types';
import Badge from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import Alert from '@/components/ui/alert';
import Pagination from '@/components/ui/pagination';

const PAGE_SIZE = 20;

const roleVariant: Record<UserRole, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  guest: 'default',
  user: 'primary',
  moderator: 'warning',
  admin: 'danger',
};

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [updating, setUpdating] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getUsers({ page, limit: PAGE_SIZE });
      setUsers(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-surface-500">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert type="error" message={error} />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">User Management</h1>
        <p className="text-sm text-surface-500 mt-1">
          View and manage registered users and their roles.
        </p>
      </div>

      {updateError && (
        <Alert type="error" message={updateError} />
      )}

      <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-surface-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">Username</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">Role</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">MindAuth ID</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">Created</th>
                <th className="text-left px-4 py-3 font-medium text-surface-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 text-surface-500">{user.id}</td>
                  <td className="px-4 py-3 font-medium text-surface-900">{user.username}</td>
                  <td className="px-4 py-3 text-surface-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={roleVariant[user.role]}>{user.role}</Badge>
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
          <div className="text-center py-12 text-surface-500">No users found.</div>
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
