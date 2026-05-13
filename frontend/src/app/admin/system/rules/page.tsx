'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const fields = [
  { key: 'title_min_length', label: '标题最小长度', unit: '字符' },
  { key: 'title_max_length', label: '标题最大长度', unit: '字符' },
  { key: 'content_min_length', label: '内容最小长度', unit: '字符' },
  { key: 'max_tags_per_post', label: '每帖最多标签', unit: '' },
  { key: 'max_tag_length', label: '标签最大长度', unit: '字符' },
];

export default function RulesPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('rules')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('rules', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">发帖规则</h1>
        <p className="text-sm text-surface-500 mt-1">设置帖子和回复的内容长度及标签限制</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <div className="bg-white border border-surface-200">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">内容限制</h2>
        </div>
        <div className="p-6 space-y-6">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">{f.label}</label>
              <div className="flex items-center gap-2">
                <input type="number" className="w-24 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} />
                {f.unit && <span className="text-xs text-surface-400">{f.unit}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
          <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    </div>
  );
}
