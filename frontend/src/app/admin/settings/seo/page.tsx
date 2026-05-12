'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function SeoSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try { setValues(await adminApi.getSettings('seo')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('seo', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">SEO Settings</h2>
        <p className="text-xs text-surface-400 mt-1">Optimize search engine indexing</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Title Suffix</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.seo_title_suffix ?? ''} onChange={(e) => update('seo_title_suffix', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">Appended to page titles, e.g. "Post Title | MindForum"</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Default Description</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[60px]" value={values.seo_default_description ?? ''} onChange={(e) => update('seo_default_description', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">OG Image URL</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.seo_og_image ?? ''} onChange={(e) => update('seo_og_image', e.target.value)} placeholder="https://example.com/og-image.png" />
          <p className="text-xs text-surface-400 mt-1">Default image for social sharing (recommended 1200x630px)</p>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.seo_sitemap_enabled === 'true'} onChange={(e) => update('seo_sitemap_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">Enable sitemap.xml</span>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.seo_robots_enabled === 'true'} onChange={(e) => update('seo_robots_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">Enable robots.txt</span>
          </label>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
