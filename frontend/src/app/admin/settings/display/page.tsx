'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function DisplaySettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('display')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('display', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">显示设置</h2>
        <p className="text-xs text-surface-400 mt-1">控制首页和列表显示行为</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">每页帖子数</label>
          <input type="number" className="w-32 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.posts_per_page ?? '20'} onChange={(e) => update('posts_per_page', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">默认排序</label>
          <select className="px-3 py-2 border border-surface-200 rounded text-sm" value={values.default_sort ?? 'newest'} onChange={(e) => update('default_sort', e.target.value)}>
            <option value="newest">最新发布</option>
            <option value="popular">最热</option>
            <option value="replies">最多回复</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">每页回复数</label>
          <input type="number" className="w-32 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.replies_per_page ?? '50'} onChange={(e) => update('replies_per_page', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">帖子详情中每页显示的回数</p>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
