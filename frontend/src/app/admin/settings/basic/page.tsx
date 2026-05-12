'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function BasicSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('basic');
      setValues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('basic', values);
      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">Site Identity</h2>
        <p className="text-xs text-surface-400 mt-1">Displayed in browser title, navigation bar and footer</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Forum Name</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_name ?? ''} onChange={(e) => update('site_name', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">Appears in browser title, navigation and footer</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Tagline</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_tagline ?? ''} onChange={(e) => update('site_tagline', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Description</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[80px]" value={values.site_description ?? ''} onChange={(e) => update('site_description', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">Used on homepage and for SEO</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Logo URL</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_logo_url ?? ''} onChange={(e) => update('site_logo_url', e.target.value)} placeholder="/logo.png" />
          <p className="text-xs text-surface-400 mt-1">Leave empty to display text logo</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Footer Copyright</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_footer ?? ''} onChange={(e) => update('site_footer', e.target.value)} />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
