'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import type { Tag } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      const data = await adminApi.getTags();
      setTags(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await adminApi.createTag({ name: newName.trim(), slug: newSlug.trim() || undefined });
      setNewName(''); setNewSlug('');
      setMessage('Tag created'); fetchTags();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleDelete = async (tag: Tag) => {
    if (!confirm(`Delete tag "${tag.name}"?`)) return;
    try { await adminApi.deleteTag(tag.id); setMessage('Tag deleted'); fetchTags(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const handleMerge = async () => {
    const fromId = tags.find(t => t.name.toLowerCase() === mergeFrom.toLowerCase())?.id;
    const toId = tags.find(t => t.name.toLowerCase() === mergeTo.toLowerCase())?.id;
    if (!fromId || !toId) { setError('Both tags must exist'); return; }
    try {
      await adminApi.mergeTags(fromId, toId);
      setMessage('Tags merged'); setMergeFrom(''); setMergeTo(''); fetchTags();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">标签管理</h1>
        <p className="text-sm text-surface-500 mt-1">创建、编辑、删除和合并标签</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Tags list */}
      <div className="bg-white border border-surface-200">
        <div className="px-5 py-4 border-b border-surface-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-600">现有标签</h2>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-50 border border-surface-200 rounded text-sm text-surface-600">
              {tag.name}
              <span className="text-xs text-surface-400 font-mono">{tag.post_count ?? 0}</span>
              <button onClick={() => handleDelete(tag)} className="text-surface-300 hover:text-surface-600">&times;</button>
            </span>
          ))}
          {tags.length === 0 && <span className="text-surface-400 text-sm">暂无标签</span>}
        </div>
      </div>

      {/* Create tag */}
      <div className="bg-white border border-surface-200">
        <div className="px-5 py-4 border-b border-surface-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-600">创建标签</h2>
        </div>
        <div className="p-4 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-surface-500 mb-1">名称</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="标签名称" />
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">别名（可选）</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="自动生成" />
          </div>
          <Button onClick={handleCreate}>创建</Button>
        </div>
      </div>

      {/* Merge tags */}
      <div className="bg-white border border-surface-200">
        <div className="px-5 py-4 border-b border-surface-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-surface-600">合并标签</h2>
        </div>
        <div className="p-4 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-surface-500 mb-1">来源</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} placeholder="来源标签名称" />
          </div>
          <div>
            <label className="block text-xs text-surface-500 mb-1">合并到</label>
            <input className="px-3 py-2 border border-surface-200 rounded text-sm" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} placeholder="目标标签名称" />
          </div>
          <Button variant="ghost" onClick={handleMerge}>合并</Button>
        </div>
      </div>
    </div>
  );
}
