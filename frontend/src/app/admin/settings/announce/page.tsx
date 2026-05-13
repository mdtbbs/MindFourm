'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function AnnounceSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setValues(await adminApi.getSettings('announce'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('announce', values);
      setMessage('Saved');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">公告设置</h2>
        <p className="text-xs text-surface-400 mt-1">首页横幅公告，支持 Markdown</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.announce_enabled === 'true'} onChange={(e) => update('announce_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">启用公告</span>
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Content</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[120px]" value={values.announce_content ?? ''} onChange={(e) => update('announce_content', e.target.value)} placeholder="公告内容（支持 Markdown）" />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
