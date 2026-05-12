'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const groups = [
  { title: 'Post Creation', fields: [{ key: 'rate_post_max', label: 'Max posts' }, { key: 'rate_post_window_min', label: 'Time window (min)' }] },
  { title: 'Reply Creation', fields: [{ key: 'rate_reply_max', label: 'Max replies' }, { key: 'rate_reply_window_min', label: 'Time window (min)' }, { key: 'rate_reply_newuser_cooldown_sec', label: 'New user cooldown (sec)' }] },
  { title: 'Login Attempts', fields: [{ key: 'rate_login_max', label: 'Max attempts' }, { key: 'rate_login_lock_min', label: 'Lock duration (min)' }] },
  { title: 'API Requests', fields: [{ key: 'rate_api_max', label: 'Requests per min' }] },
];

export default function RateLimitsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('rate_limit')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('rate_limit', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Rate Limits</h1>
        <p className="text-sm text-surface-500 mt-1">Prevent abuse by controlling action frequency</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups.map((group) => (
          <div key={group.title} className="bg-surface-50 border border-surface-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-4">{group.title}</h3>
            <div className="space-y-3">
              {group.fields.map((f) => (
                <div key={f.key} className="flex justify-between items-center">
                  <span className="text-sm text-surface-600">{f.label}</span>
                  <input type="number" className="w-20 px-2 py-1 border border-surface-200 rounded text-sm text-center font-mono focus:outline-none focus:border-surface-400" value={values[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</Button>
      </div>
    </div>
  );
}
