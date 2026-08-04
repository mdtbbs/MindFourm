'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import {
  isSafeFooterHref,
  parseFooterFriendlyLinks,
  serializeFooterFriendlyLinks,
  type FooterFriendlyLink,
} from '@/lib/footer/footer-settings';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';

const EMPTY_LINK: FooterFriendlyLink = { label: '', href: '', description: '' };

function toEditableLinks(rawValue: string | undefined): FooterFriendlyLink[] {
  const links = parseFooterFriendlyLinks(rawValue);
  return links.length > 0 ? links : [{ ...EMPTY_LINK }];
}

export default function FooterSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<FooterFriendlyLink[]>([{ ...EMPTY_LINK }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getSettings('footer');
      setValues(data);
      setLinks(toEditableLinks(data.footer_friendly_links));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load footer settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const linkErrors = useMemo(() => {
    return links.flatMap((link, index) => {
      const hasAnyValue = Boolean(link.label.trim() || link.href.trim() || link.description?.trim());
      if (!hasAnyValue) return [];
      const errors: string[] = [];
      if (!link.label.trim()) errors.push(`第 ${index + 1} 个友情链接缺少名称`);
      if (!isSafeFooterHref(link.href.trim())) errors.push(`第 ${index + 1} 个友情链接 URL 必须以 / 或 http(s):// 开头`);
      return errors;
    });
  }, [links]);

  const update = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const updateLink = (index: number, key: keyof FooterFriendlyLink, value: string) => {
    setLinks((prev) => prev.map((link, i) => (i === index ? { ...link, [key]: value } : link)));
  };

  const addLink = () => {
    setLinks((prev) => [...prev, { ...EMPTY_LINK }]);
  };

  const removeLink = (index: number) => {
    setLinks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ ...EMPTY_LINK }];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (linkErrors.length > 0) {
        throw new Error(linkErrors[0]);
      }

      const payload = {
        ...values,
        footer_friendly_links: serializeFooterFriendlyLinks(links),
      };
      await adminApi.updateSettings('footer', payload);
      await refreshAfterSettingsSave();
      setValues(payload);
      setLinks(toEditableLinks(payload.footer_friendly_links));
      setMessage('页脚设置已保存');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存页脚设置失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">页脚设置</h2>
        <p className="text-xs text-surface-400 mt-1">配置底部友情链接、版权文案和备案信息；留空则前台自动隐藏。</p>
      </div>

      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}
        {linkErrors.map((item) => <Alert key={item} type="error" message={item} />)}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">版权文案</label>
          <input
            className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
            value={values.footer_copyright ?? ''}
            onChange={(e) => update('footer_copyright', e.target.value)}
            placeholder="© 2026 MindFourm. All rights reserved."
          />
          <p className="text-xs text-surface-400 mt-1">留空时使用"基本信息"里的页脚版权信息，再留空则自动生成。</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">ICP备案号</label>
            <input
              className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
              value={values.footer_icp_number ?? ''}
              onChange={(e) => update('footer_icp_number', e.target.value)}
              placeholder="蜀ICP备xxxxxxxx号"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">ICP备案链接</label>
            <input
              className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
              value={values.footer_icp_url ?? ''}
              onChange={(e) => update('footer_icp_url', e.target.value)}
              placeholder="https://beian.miit.gov.cn/"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">公安备案号</label>
            <input
              className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
              value={values.footer_police_number ?? ''}
              onChange={(e) => update('footer_police_number', e.target.value)}
              placeholder="川公网安备 xxxxxxxxxxxxxx号"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">公安备案链接</label>
            <input
              className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
              value={values.footer_police_url ?? ''}
              onChange={(e) => update('footer_police_url', e.target.value)}
              placeholder="https://www.beian.gov.cn/portal/registerSystemInfo"
            />
          </div>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">页面内容管理</span>已移至独立的管理页面。
              请访问 <a href="/admin/content/pages" className="text-blue-700 hover:underline font-medium">内容 → 页面管理</a> 来编辑"关于我们"、"鸣谢"、"服务条款"和"隐私政策"页面的内容。
            </p>
          </div>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-surface-800">友情链接</h3>
              <p className="mt-1 text-xs text-surface-400">Footer 展示前 3 个，完整列表显示在 /links 页面。URL 支持站内 /path 或 http(s):// 外链。</p>
            </div>
            <Button type="button" variant="ghost" onClick={addLink}>添加友链</Button>
          </div>

          <div className="mt-4 space-y-4">
            {links.map((link, index) => (
              <div key={index} className="border border-surface-200 bg-surface-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-surface-500">友情链接 #{index + 1}</div>
                  <Button type="button" variant="ghost" onClick={() => removeLink(index)}>删除</Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">名称</label>
                    <input
                      className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
                      value={link.label}
                      onChange={(e) => updateLink(index, 'label', e.target.value)}
                      placeholder="Mindustry 官网"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">URL</label>
                    <input
                      className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
                      value={link.href}
                      onChange={(e) => updateLink(index, 'href', e.target.value)}
                      placeholder="https://mindustrygame.github.io/"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">描述（可选）</label>
                    <input
                      className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
                      value={link.description ?? ''}
                      onChange={(e) => updateLink(index, 'description', e.target.value)}
                      placeholder="一句话说明这个链接"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>重置</Button>
        <Button onClick={handleSave} disabled={saving || linkErrors.length > 0}>{saving ? '保存中...' : '保存'}</Button>
      </div>
    </div>
  );
}
