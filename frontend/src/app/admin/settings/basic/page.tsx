'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/api/client';
import { useSettingsStore } from '@/store/settings-store';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const MAX_SITE_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_SITE_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BasicSettingsPage() {
  const updateGlobalSetting = useSettingsStore((state) => state.updateSetting);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  const handleLogoUpload = async (file: File) => {
    if (!ALLOWED_SITE_LOGO_TYPES.has(file.type)) {
      setError('请选择 JPEG、PNG、GIF 或 WebP 图片');
      return;
    }

    if (file.size > MAX_SITE_LOGO_SIZE) {
      setError(`图片大小不能超过 ${formatBytes(MAX_SITE_LOGO_SIZE)}`);
      return;
    }

    setUploadingLogo(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      const uploaded = await adminApi.uploadSiteLogo(formData);
      update('site_logo_url', uploaded.url);
      updateGlobalSetting('site_logo_url', uploaded.url);
      setMessage('站点图标已上传并应用');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传站点图标失败');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const update = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">站点信息</h2>
        <p className="text-xs text-surface-400 mt-1">显示在浏览器标题、导航栏和页脚</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">论坛名称</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_name ?? ''} onChange={(e) => update('site_name', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">显示在浏览器标题、导航和页脚</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">标语</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_tagline ?? ''} onChange={(e) => update('site_tagline', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">描述</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[80px]" value={values.site_description ?? ''} onChange={(e) => update('site_description', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">用于首页和 SEO</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[160px_1fr]">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">站点图标</label>
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded border border-surface-200 bg-surface-50">
              {values.site_logo_url ? (
                <img src={values.site_logo_url} alt="站点图标预览" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-3 text-center text-xs text-surface-400">未设置图标</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Logo 地址</label>
              <input
                className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
                value={values.site_logo_url ?? ''}
                onChange={(e) => update('site_logo_url', e.target.value)}
                placeholder="/uploads/public-images/logo.png"
              />
              <p className="text-xs text-surface-400 mt-1">留空则显示文字 Logo；也可手动填写外部图片 URL</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleLogoUpload(file);
                }}
                disabled={uploadingLogo}
              />
              <Button type="button" variant="ghost" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                {uploadingLogo ? '上传中...' : '上传图片'}
              </Button>
              {values.site_logo_url ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    update('site_logo_url', '');
                    updateGlobalSetting('site_logo_url', '');
                  }}
                  disabled={uploadingLogo}
                >
                  清空
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-surface-400">支持 JPEG、PNG、GIF、WebP，最大 {formatBytes(MAX_SITE_LOGO_SIZE)}。上传成功后会立即应用到站点图标设置。</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">页脚版权信息</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_footer ?? ''} onChange={(e) => update('site_footer', e.target.value)} />
        </div>

        <div className="border-t border-surface-200 pt-6">
          <h3 className="text-sm font-semibold text-surface-800">全站品牌色</h3>
          <p className="mt-1 text-xs text-surface-400">
            影响顶部导航、按钮、选中态和全站品牌强调色。需要填写 6 位十六进制颜色。
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">主品牌色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 border border-surface-200 bg-white p-1"
                value={values.brand_primary ?? '#2f80ed'}
                onChange={(e) => update('brand_primary', e.target.value)}
              />
              <input
                className="w-36 px-3 py-2 border border-surface-200 rounded text-sm font-mono focus:outline-none focus:border-surface-400"
                value={values.brand_primary ?? '#2f80ed'}
                onChange={(e) => update('brand_primary', e.target.value)}
              />
            </div>
            <p className="text-xs text-surface-400 mt-1">例如：#2f80ed</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">辅助背景色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 border border-surface-200 bg-white p-1"
                value={values.brand_accent ?? '#dcecff'}
                onChange={(e) => update('brand_accent', e.target.value)}
              />
              <input
                className="w-36 px-3 py-2 border border-surface-200 rounded text-sm font-mono focus:outline-none focus:border-surface-400"
                value={values.brand_accent ?? '#dcecff'}
                onChange={(e) => update('brand_accent', e.target.value)}
              />
            </div>
            <p className="text-xs text-surface-400 mt-1">用于较浅的强调背景和柔和色块</p>
          </div>
        </div>

        <div className="border border-surface-200 bg-surface-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-surface-600">预览</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center rounded px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: values.brand_primary || '#2f80ed' }}
            >
              主按钮
            </div>
            <div
              className="inline-flex items-center rounded border px-3 py-2 text-sm"
              style={{
                borderColor: values.brand_primary || '#2f80ed',
                color: values.brand_primary || '#2f80ed',
                backgroundColor: values.brand_accent || '#dcecff',
              }}
            >
              导航 / 选中态
            </div>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}
