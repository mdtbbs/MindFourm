'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function CleanupPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('cleanup')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('cleanup', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const runCleanup = async (endpoint: string) => {
    try {
      const result = await (adminApi as any)[endpoint]();
      setMessage(result.message);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">Data Cleanup</h1>
        <p className="text-sm text-surface-500 mt-1">Automated rules and manual tools for database maintenance</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Auto cleanup rules */}
      <div className="bg-white border border-surface-200">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Auto Cleanup Rules</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface-50 border border-surface-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-4">Audit Logs</h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-surface-600">Retention days</span>
              <input type="number" className="w-20 px-2 py-1 border border-surface-200 rounded text-sm text-center font-mono" value={values.cleanup_log_retention_days ?? '90'} onChange={(e) => update('cleanup_log_retention_days', e.target.value)} />
            </div>
            <p className="text-xs text-surface-400">Delete oldest when exceeding limit</p>
          </div>

          <div className="bg-surface-50 border border-surface-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-4">Soft Deleted</h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-surface-600">Retention days</span>
              <input type="number" className="w-20 px-2 py-1 border border-surface-200 rounded text-sm text-center font-mono" value={values.cleanup_soft_delete_retention_days ?? '30'} onChange={(e) => update('cleanup_soft_delete_retention_days', e.target.value)} />
            </div>
            <p className="text-xs text-surface-400">Permanent delete after retention</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-surface-200 flex justify-end gap-2">
          <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      {/* Manual cleanup */}
      <div className="bg-white border border-surface-200">
        <div className="px-6 py-4 border-b border-surface-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Manual Cleanup</h2>
        </div>
        <div className="p-6 flex gap-3 flex-wrap">
          <Button variant="danger" onClick={() => runCleanup('cleanupSessions')}>Clear Expired Sessions</Button>
          <Button variant="danger" onClick={() => runCleanup('cleanupLogs')}>Clear Old Logs</Button>
          <Button variant="danger" onClick={() => runCleanup('cleanupSoftDeleted')}>Purge Soft Deleted</Button>
        </div>
      </div>
    </div>
  );
}
