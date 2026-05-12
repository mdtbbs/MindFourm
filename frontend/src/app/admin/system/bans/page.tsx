'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { AdminBan, CreateBanInput } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function BansPage() {
  const [bans, setBans] = useState<AdminBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateBanInput>({ ban_type: 'ip', value: '', reason: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBans = useCallback(async () => {
    try {
      const res = await adminApi.getBans();
      setBans(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBans(); }, [fetchBans]);

  const handleCreate = async () => {
    if (!form.value.trim()) return;
    try {
      await adminApi.createBan(form);
      setForm({ ban_type: 'ip', value: '', reason: '' });
      setShowForm(false); setMessage('Ban added'); fetchBans();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDeactivate = async (id: number) => {
    try { await adminApi.deactivateBan(id); setMessage('Ban removed'); fetchBans(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Ban Management</h1>
          <p className="text-sm text-surface-500 mt-1">Block specific IP addresses or users</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>New Ban</Button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {showForm && (
        <div className="bg-white border border-surface-200 p-4 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-surface-500 mb-1">Type</label>
            <select className="px-3 py-2 border border-surface-200 rounded text-sm" value={form.ban_type} onChange={(e) => setForm({ ...form, ban_type: e.target.value as any })}>
              <option value="ip">IP</option>
              <option value="ip_range">IP Range</option>
              <option value="user">User</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">Value</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm font-mono" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="IP or user ID" />
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">Reason</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason" />
          </div>
          <Button onClick={handleCreate}>Add</Button>
          <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
        </div>
      )}

      <div className="bg-white border border-surface-200 overflow-hidden">
        {bans.length === 0 ? (
          <div className="p-8 text-center text-surface-400">No bans</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Value</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">By</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-surface-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bans.map((ban) => (
                <tr key={ban.id} className="border-b border-surface-100 last:border-b-0 hover:bg-surface-50">
                  <td className="px-4 py-3"><span className="text-xs bg-surface-100 text-surface-500 px-2 py-0.5 rounded uppercase font-semibold">{ban.ban_type}</span></td>
                  <td className="px-4 py-3 font-mono text-sm">{ban.value}</td>
                  <td className="px-4 py-3 text-surface-600">{ban.reason || '—'}</td>
                  <td className="px-4 py-3 text-surface-500">{(ban as any).creator_name || '—'}</td>
                  <td className="px-4 py-3 text-surface-500 font-mono text-xs">{new Date(ban.created_at).toLocaleDateString('zh-CN')}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded font-semibold ${ban.is_active ? 'bg-surface-100 text-surface-600' : 'bg-surface-50 text-surface-400'}`}>{ban.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-3"><Button variant="danger" size="sm" onClick={() => handleDeactivate(ban.id)}>Remove</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
