'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/api/client';
import { useSettingsStore } from '@/store/settings-store';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BrandSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const updateGlobalSetting = useSettingsStore((state) => state.updateSetting);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('brand');
      setValues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载品牌设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('brand', values);
      await refreshAfterSettingsSave();
      setMessage('品牌设置已保存');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError('请选择 JPEG、PNG、GIF 或 WebP 图片');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(`图片大小不能超过 ${formatBytes(MAX_IMAGE_SIZE)}`);
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
      await refreshAfterSettingsSave();
      setMessage('站点 Logo 已上传并应用');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传站点 Logo 失败');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleFaviconUpload = async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError('请选择 JPEG、PNG、GIF 或 WebP 图片');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(`图片大小不能超过 ${formatBytes(MAX_IMAGE_SIZE)}`);
      return;
    }

    setUploadingFavicon(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      const uploaded = await adminApi.uploadSiteFavicon(formData);
      update('site_favicon_url', uploaded.url);
      updateGlobalSetting('site_favicon_url', uploaded.url);
      await refreshAfterSettingsSave();
      setMessage('站点 Favicon 已上传并应用');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传站点 Favicon 失败');
    } finally {
      setUploadingFavicon(false);
      if (faviconInputRef.current) {
        faviconInputRef.current.value = '';
      }
    }
  };

  const update = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">品牌设置</h2>
        <p className="text-xs text-surface-400 mt-1">站点名称、Logo、Favicon 等品牌标识</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">站点名称</label>
          <input
            className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
            value={values.site_name ?? ''}
            onChange={(e) => update('site_name', e.target.value)}
          />
          <p className="text-xs text-surface-400 mt-1">显示在浏览器标题、导航和页脚</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">标语</label>
          <input
            className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
            value={values.site_tagline ?? ''}
            onChange={(e) => update('site_tagline', e.target.value)}
          />
          <p className="text-xs text-surface-400 mt-1">简短描述站点的副标题</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">站点介绍</label>
          <textarea
            className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[80px]"
            value={values.site_description ?? ''}
            onChange={(e) => update('site_description', e.target.value)}
          />
          <p className="text-xs text-surface-400 mt-1">用于首页和 SEO 描述</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">侧栏标题</label>
          <input
            className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
            value={values.sidebar_title ?? ''}
            onChange={(e) => update('sidebar_title', e.target.value)}
          />
          <p className="text-xs text-surface-400 mt-1">侧栏导航区域的标题文字</p>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <h3 className="text-sm font-semibold text-surface-800">站点 Logo</h3>
          <p className="mt-1 text-xs text-surface-400">导航栏和页脚显示的站点标识图片</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[160px_1fr]">
          <div>
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded border border-surface-200 bg-surface-50">
              {values.site_logo_url ? (
                <img src={values.site_logo_url} alt="Logo 预览" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-3 text-center text-xs text-surface-400">未设置 Logo</span>
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
            <p className="text-xs text-surface-400">支持 JPEG、PNG、GIF、WebP，最大 {formatBytes(MAX_IMAGE_SIZE)}</p>
          </div>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <h3 className="text-sm font-semibold text-surface-800">站点 Favicon</h3>
          <p className="mt-1 text-xs text-surface-400">浏览器标签页和书签中显示的小图标</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[160px_1fr]">
          <div>
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-surface-200 bg-surface-50">
              {values.site_favicon_url ? (
                <img src={values.site_favicon_url} alt="Favicon 预览" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="px-2 text-center text-xs text-surface-400">未设置</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">Favicon 地址</label>
              <input
                className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
                value={values.site_favicon_url ?? ''}
                onChange={(e) => update('site_favicon_url', e.target.value)}
                placeholder="/uploads/public-images/favicon.ico"
              />
              <p className="text-xs text-surface-400 mt-1">推荐 32x32 或 64x64 的图标文件</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFaviconUpload(file);
                }}
                disabled={uploadingFavicon}
              />
              <Button type="button" variant="ghost" onClick={() => faviconInputRef.current?.click()} disabled={uploadingFavicon}>
                {uploadingFavicon ? '上传中...' : '上传图片'}
              </Button>
              {values.site_favicon_url ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    update('site_favicon_url', '');
                    updateGlobalSetting('site_favicon_url', '');
                  }}
                  disabled={uploadingFavicon}
                >
                  清空
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-surface-400">支持 JPEG、PNG、GIF、WebP，最大 {formatBytes(MAX_IMAGE_SIZE)}</p>
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
