'use client';

import { useCallback, useEffect, useState } from 'react';
import { groupsAdminApi, Group, GroupInput, GroupMember, userApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { Edit, Plus, Trash2, Users, X } from 'lucide-react';

type MemberRole = GroupMember['role'];
type UserOption = Pick<Awaited<ReturnType<typeof userApi.search>>[number], 'id' | 'username' | 'avatar_url'>;

const emptyForm: GroupInput = {
  name: '',
  slug: '',
  description: '',
  icon: '',
  color: '',
  sort_order: 0,
};

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<GroupInput>(emptyForm);
  const [editing, setEditing] = useState<Group | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [memberGroup, setMemberGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [memberRole, setMemberRole] = useState<MemberRole>('member');
  const [memberSaving, setMemberSaving] = useState(false);

  const fetchGroups = useCallback(async () => {
    setError(null);
    try {
      setGroups((await groupsAdminApi.getAll()) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载用户组失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError('请输入用户组名称');
      return;
    }
    if (form.sort_order !== undefined && (!Number.isInteger(form.sort_order) || form.sort_order < 0)) {
      setError('排序必须是非负整数');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        ...form,
        name: form.name.trim(),
        slug: form.slug?.trim() || undefined,
        description: form.description?.trim() || undefined,
        icon: form.icon?.trim() || undefined,
        color: form.color?.trim() || undefined,
      };
      if (editing) {
        await groupsAdminApi.update(editing.id, body);
        notify('用户组已更新');
      } else {
        await groupsAdminApi.create(body);
        notify('用户组已创建');
      }
      resetForm();
      await fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存用户组失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: Group) => {
    if (group.is_system) return;
    if (!window.confirm(`确定要删除用户组「${group.name}」吗？成员关系也会被移除。`)) return;
    setDeleting(group.id);
    setError(null);
    try {
      await groupsAdminApi.delete(group.id);
      notify('用户组已删除');
      await fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除用户组失败');
    } finally {
      setDeleting(null);
    }
  };

  const openMembers = async (group: Group) => {
    setMemberGroup(group);
    setMembers([]);
    setMemberError(null);
    setMembersLoading(true);
    try {
      const result = await groupsAdminApi.getMembers(group.slug);
      setMembers(result.members || []);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '加载成员失败');
    } finally {
      setMembersLoading(false);
    }
  };

  const searchUsers = async () => {
    if (userQuery.trim().length < 2) {
      setUserOptions([]);
      return;
    }
    try {
      setUserOptions(await userApi.search(userQuery.trim(), 10));
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '搜索用户失败');
    }
  };

  const addMember = async () => {
    if (!memberGroup || !selectedUser) return;
    setMemberSaving(true);
    setMemberError(null);
    try {
      await groupsAdminApi.addMember(memberGroup.id, { user_id: selectedUser.id, role: memberRole });
      notify('成员已添加');
      setSelectedUser(null);
      setUserQuery('');
      setUserOptions([]);
      await openMembers(memberGroup);
      await fetchGroups();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '添加成员失败');
    } finally {
      setMemberSaving(false);
    }
  };

  const removeMember = async (member: GroupMember) => {
    if (!memberGroup || !window.confirm(`确定要移除成员「${member.username}」吗？`)) return;
    setMemberError(null);
    try {
      await groupsAdminApi.removeMember(memberGroup.id, member.id);
      notify('成员已移除');
      await openMembers(memberGroup);
      await fetchGroups();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : '移除成员失败');
    }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">用户组管理</h1>
          <p className="text-sm text-surface-500 mt-1">管理用户组、成员和成员角色</p>
        </div>
        <Button onClick={() => { setForm({ ...emptyForm }); setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1" /> 添加用户组
        </Button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {showForm && (
        <div className="bg-white border border-surface-200 rounded p-6">
          <h2 className="text-sm font-semibold mb-4">{editing ? '编辑用户组' : '添加用户组'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-xs font-medium">名称 *<input className="mt-1 w-full px-3 py-2 border rounded text-sm" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-xs font-medium">Slug<input className="mt-1 w-full px-3 py-2 border rounded text-sm" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /></label>
            <label className="text-xs font-medium">图标 URL<input className="mt-1 w-full px-3 py-2 border rounded text-sm" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} /></label>
            <label className="text-xs font-medium">颜色<input type="text" className="mt-1 w-full px-3 py-2 border rounded text-sm" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="#3b82f6" /></label>
            <label className="text-xs font-medium">排序<input type="number" min="0" className="mt-1 w-full px-3 py-2 border rounded text-sm" value={form.sort_order ?? 0} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></label>
            <label className="text-xs font-medium md:col-span-2">描述<textarea className="mt-1 w-full px-3 py-2 border rounded text-sm" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={handleSubmit} disabled={saving}>{saving ? '保存中...' : editing ? '保存修改' : '创建用户组'}</Button><Button variant="secondary" onClick={resetForm}>取消</Button></div>
        </div>
      )}

      <div className="space-y-2">
        {groups.map(group => (
          <div key={group.id} className="bg-white border border-surface-200 rounded p-4 flex items-center gap-4">
            {group.icon ? <img src={group.icon} alt="" className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: group.color || 'var(--primary)' }}>{group.name.charAt(0)}</div>}
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><h3 className="font-semibold truncate">{group.name}</h3>{group.is_system ? <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">系统组</span> : null}</div><p className="text-sm text-surface-500">{group.slug} · {group.member_count ?? '—'} 名成员{group.description ? ` · ${group.description}` : ''}</p></div>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => openMembers(group)}><Users className="w-3 h-3 mr-1" />成员</Button><Button size="sm" variant="secondary" onClick={() => { setEditing(group); setForm({ name: group.name, slug: group.slug, description: group.description || '', icon: group.icon || '', color: group.color || '', sort_order: group.sort_order }); setShowForm(true); }}><Edit className="w-3 h-3 mr-1" />编辑</Button>{group.is_system ? <span className="text-xs text-surface-400 self-center">不可删除</span> : <Button size="sm" variant="destructive" disabled={deleting === group.id} onClick={() => handleDelete(group)}><Trash2 className="w-3 h-3 mr-1" />删除</Button>}</div>
          </div>
        ))}
        {groups.length === 0 && <div className="text-center py-12 text-surface-500"><Users className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>暂无用户组</p></div>}
      </div>

      {memberGroup && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="font-semibold">成员管理 · {memberGroup.name}</h2><button onClick={() => setMemberGroup(null)} aria-label="关闭"><X className="w-5 h-5" /></button></div>
            {memberError && <Alert type="error" message={memberError} />}
            <div className="border rounded p-3 mb-4"><div className="flex gap-2"><input className="flex-1 px-3 py-2 border rounded text-sm" value={userQuery} onChange={e => setUserQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchUsers(); }} placeholder="输入至少两个字符搜索用户" /><Button size="sm" onClick={searchUsers}>搜索</Button></div>{userOptions.length > 0 && <div className="mt-2 space-y-1">{userOptions.map(option => <button key={option.id} className={`w-full text-left p-2 rounded hover:bg-surface-50 ${selectedUser?.id === option.id ? 'bg-primary/10' : ''}`} onClick={() => setSelectedUser(option)}>{option.username} <span className="text-xs text-surface-400">#{option.id}</span></button>)}</div>}{selectedUser && <div className="mt-2 flex items-center gap-2 text-sm">已选择：{selectedUser.username}<select className="ml-auto border rounded px-2 py-1" value={memberRole} onChange={e => setMemberRole(e.target.value as MemberRole)}><option value="member">成员</option><option value="moderator">版主</option><option value="admin">管理员</option></select><Button size="sm" onClick={addMember} disabled={memberSaving}>{memberSaving ? '添加中...' : '添加'}</Button></div>}</div>
            {membersLoading ? <div className="py-8 text-center text-surface-500">加载成员中...</div> : members.length === 0 ? <div className="py-8 text-center text-surface-500">暂无成员</div> : <div className="space-y-2">{members.map(member => <div key={member.id} className="flex items-center gap-3 border-b py-2"><div className="flex-1"><span className="font-medium">{member.username}</span><span className="text-xs text-surface-500 ml-2">{member.role}</span></div><Button size="sm" variant="destructive" onClick={() => removeMember(member)}>移除</Button></div>)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
