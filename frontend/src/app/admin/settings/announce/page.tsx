'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import { parseNotices, type Notice } from '@/lib/notices/parse-notices';

const TiptapEditor = dynamic(() => import('@/components/ui/tiptap-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-surface-200 bg-white">
      <Loader2 className="h-5 w-5 animate-spin text-surface-400" />
      <span className="ml-2 text-sm text-surface-500">加载编辑器…</span>
    </div>
  ),
});

function getLocalDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

const emptyNotice = (): Notice => ({
  title: '',
  content: '',
  published_at: getLocalDate(),
  pinned: false,
});

export default function AnnounceSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Notice[]>([]);
  const [draft, setDraft] = useState<Notice>(emptyNotice);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await adminApi.getSettings('announce');
      setValues(settings);
      setNotices(parseNotices(settings.notices_content));
      setDraft(emptyNotice());
      setEditingIndex(null);
      setEditorOpen(false);
    } catch (err) {
      setError(err instanceof Error ? `公告设置读取失败：${err.message}` : '公告设置读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.updateSettings('announce', {
        ...values,
        notices_content: JSON.stringify(notices),
      });
      await refreshAfterSettingsSave();
      setMessage('公告设置已保存');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const openCreateEditor = () => {
    setDraft(emptyNotice());
    setEditingIndex(null);
    setEditorOpen(true);
    setError(null);
  };

  const openEditEditor = (index: number) => {
    setDraft({ ...notices[index] });
    setEditingIndex(index);
    setEditorOpen(true);
    setError(null);
  };

  const closeEditor = () => {
    setDraft(emptyNotice());
    setEditingIndex(null);
    setEditorOpen(false);
  };

  const commitDraft = async () => {
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title) {
      setError('请输入公告标题');
      return;
    }
    if (!content) {
      setError('请输入公告正文');
      return;
    }

    const notice: Notice = {
      title,
      content,
      published_at: draft.published_at || undefined,
      pinned: Boolean(draft.pinned),
    };
    const nextNotices = editingIndex === null
      ? [notice, ...notices]
      : notices.map((item, index) => index === editingIndex ? notice : item);

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.updateSettings('announce', {
        notices_content: JSON.stringify(nextNotices),
      });
      await refreshAfterSettingsSave();
      setNotices(nextNotices);
      setValues((current) => ({ ...current, notices_content: JSON.stringify(nextNotices) }));
      setMessage(editingIndex === null ? '公告已发布' : '公告修改已保存');
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : '公告发布失败');
    } finally {
      setSaving(false);
    }
  };

  const removeNotice = async (index: number) => {
    if (!window.confirm(`确定删除公告“${notices[index].title}”吗？`)) return;
    const nextNotices = notices.filter((_, itemIndex) => itemIndex !== index);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.updateSettings('announce', {
        notices_content: JSON.stringify(nextNotices),
      });
      await refreshAfterSettingsSave();
      setNotices(nextNotices);
      setValues((current) => ({ ...current, notices_content: JSON.stringify(nextNotices) }));
      setMessage('公告已删除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '公告删除失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中...</div>;

  return (
    <div className="border border-surface-200 bg-white">
      <div className="border-b border-surface-200 px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">公告设置</h2>
        <p className="mt-1 text-xs text-surface-400">管理首页横幅和公告中心内容</p>
      </div>

      <div className="space-y-8 p-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-surface-800">首页公告横幅</h3>
            <p className="mt-1 text-xs text-surface-500">显示在论坛页面顶部的简短公告，支持 Markdown。</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={values.announce_enabled === 'true'}
              onChange={(event) => update('announce_enabled', event.target.checked ? 'true' : 'false')}
              className="h-4 w-4 accent-surface-900"
            />
            <span className="text-sm text-surface-700">启用首页公告横幅</span>
          </label>
          <textarea
            className="min-h-[100px] w-full rounded border border-surface-200 px-3 py-2 text-sm focus:border-surface-400 focus:outline-none"
            value={values.announce_content ?? ''}
            onChange={(event) => update('announce_content', event.target.value)}
            placeholder="输入首页横幅内容（支持 Markdown）"
          />
        </section>

        <section className="space-y-4 border-t border-surface-200 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-surface-800">公告中心</h3>
              <p className="mt-1 text-xs text-surface-500">像发布帖子一样编写公告，保存设置后会显示在公告中心。</p>
            </div>
            {!editorOpen && (
              <Button onClick={openCreateEditor}>
                <Plus className="mr-1.5 h-4 w-4" />发布公告
              </Button>
            )}
          </div>

          {editorOpen && (
            <div className="space-y-5 rounded-xl border border-surface-200 bg-surface-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-surface-900">{editingIndex === null ? '发布新公告' : '编辑公告'}</h4>
                  <p className="mt-1 text-xs text-surface-500">标题和正文为必填项。</p>
                </div>
                <button type="button" onClick={closeEditor} aria-label="关闭编辑器" className="rounded-lg p-2 text-surface-500 hover:bg-surface-200">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-surface-700">公告标题</label>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  maxLength={120}
                  className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm focus:border-surface-400 focus:outline-none"
                  placeholder="例如：论坛维护通知"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-surface-700">公告正文</label>
                <TiptapEditor
                  value={draft.content}
                  onChange={(content) => setDraft((current) => ({ ...current, content }))}
                  placeholder="编写公告正文，支持富文本、Markdown 和图片上传…"
                  minHeight="240px"
                  imageUpload
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-surface-700">发布日期</label>
                  <input
                    type="date"
                    value={draft.published_at ?? ''}
                    onChange={(event) => setDraft((current) => ({ ...current, published_at: event.target.value }))}
                    className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm focus:border-surface-400 focus:outline-none"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-surface-200 bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.pinned)}
                    onChange={(event) => setDraft((current) => ({ ...current, pinned: event.target.checked }))}
                    className="h-4 w-4 accent-surface-900"
                  />
                  <Pin className="h-4 w-4 text-surface-500" />
                  <span className="text-sm text-surface-700">置顶这条公告</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-surface-200 pt-4">
                <Button variant="ghost" onClick={closeEditor}>取消</Button>
                <Button onClick={commitDraft} disabled={saving}>
                  {saving ? '保存中...' : editingIndex === null ? '发布公告' : '保存修改'}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {notices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-300 px-6 py-10 text-center">
                <p className="text-sm text-surface-500">还没有公告</p>
                {!editorOpen && <button type="button" onClick={openCreateEditor} className="mt-2 text-sm font-medium text-surface-900 hover:underline">发布第一条公告</button>}
              </div>
            ) : notices.map((notice, index) => (
              <article key={`${notice.title}-${index}`} className="rounded-xl border border-surface-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {notice.pinned && <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"><Pin className="h-3 w-3" />置顶</span>}
                      <h4 className="truncate font-semibold text-surface-900">{notice.title}</h4>
                      {/* Defensive check: only render time if published_at is a string */}
                      {typeof notice.published_at === 'string' && notice.published_at && (
                        <time className="text-xs text-surface-400">{notice.published_at}</time>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-surface-500">{notice.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={editorOpen} onClick={() => openEditEditor(index)} aria-label={`编辑${notice.title}`} className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 hover:text-surface-900 disabled:cursor-not-allowed disabled:opacity-40">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" disabled={editorOpen || saving} onClick={() => removeNotice(index)} aria-label={`删除${notice.title}`} className="rounded-lg p-2 text-surface-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t border-surface-200 px-6 py-4">
        <Button variant="ghost" onClick={fetchSettings}>放弃更改</Button>
        <Button onClick={handleSave} disabled={saving || editorOpen}>
          {saving ? '保存中...' : editorOpen ? '请先完成公告编辑' : '保存横幅设置'}
        </Button>
      </div>
    </div>
  );
}
