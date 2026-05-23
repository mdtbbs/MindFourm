'use client';

import { useState, useEffect } from 'react';
import { resourceCategoryApi } from '@/lib/api/client';
import { ResourceCategory } from '@/types';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';

export default function ResourceCategoryManager() {
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [editing, setEditing] = useState<ResourceCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', description: '', icon: '', sort_order: 0, is_active: true });
  const [error, setError] = useState<string | null>(null);

  const loadCategories = () => {
    resourceCategoryApi.list().then(setCategories).catch(() => {});
  };

  useEffect(() => { loadCategories(); }, []);

  const handleCreate = async () => {
    setError(null);
    try {
      await resourceCategoryApi.create(form);
      setCreating(false);
      setForm({ name: '', slug: '', description: '', icon: '', sort_order: 0, is_active: true });
      loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setError(null);
    try {
      await resourceCategoryApi.update(editing.id, form);
      setEditing(null);
      setForm({ name: '', slug: '', description: '', icon: '', sort_order: 0, is_active: true });
      loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此类别？')) return;
    try {
      const res = await resourceCategoryApi.delete(id);
      loadCategories();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEdit = (cat: ResourceCategory) => {
    setEditing(cat);
    setCreating(false);
    setForm({
      name: cat.name, slug: cat.slug, description: cat.description || '',
      icon: cat.icon || '', sort_order: cat.sort_order, is_active: cat.is_active,
    });
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ name: '', slug: '', description: '', icon: '', sort_order: 0, is_active: true });
  };

  const cancel = () => {
    setCreating(false);
    setEditing(null);
    setError(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">资源类别管理</h3>
        <button
          onClick={startCreate}
          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-dark)]"
        >
          <Plus className="w-4 h-4" /> 新增类别
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {(creating || editing) && (
        <div className="mb-4 p-4 bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 space-y-3">
          <h4 className="font-medium">{editing ? '编辑类别' : '新增类别'}</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="名称 *"
              className="px-3 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg text-sm"
            />
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="Slug *"
              className="px-3 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg text-sm"
            />
            <input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="图标 (lucide 名称)"
              className="px-3 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg text-sm"
            />
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
              placeholder="排序"
              className="px-3 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg text-sm"
            />
          </div>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="描述"
            className="w-full px-3 py-2 bg-surface-50 dark:bg-gray-700 border border-surface-200 dark:border-gray-600 rounded-lg text-sm"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span className="text-sm">启用</span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={editing ? handleUpdate : handleCreate}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg"
            >
              <Check className="w-4 h-4" /> {editing ? '保存' : '创建'}
            </button>
            <button onClick={cancel} className="flex items-center gap-1 px-3 py-1.5 text-sm text-surface-500">
              <X className="w-4 h-4" /> 取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg border border-surface-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 dark:border-gray-700 bg-surface-50 dark:bg-gray-800">
              <th className="text-left px-4 py-3 font-medium">名称</th>
              <th className="text-left px-4 py-3 font-medium">Slug</th>
              <th className="text-left px-4 py-3 font-medium">图标</th>
              <th className="text-left px-4 py-3 font-medium">排序</th>
              <th className="text-left px-4 py-3 font-medium">状态</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} className="border-b border-surface-100 dark:border-gray-800 hover:bg-surface-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium">{cat.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{cat.slug}</td>
                <td className="px-4 py-3">{cat.icon || '-'}</td>
                <td className="px-4 py-3">{cat.sort_order}</td>
                <td className="px-4 py-3">{cat.is_active ? '启用' : '禁用'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(cat)} className="text-[var(--primary)] hover:underline">
                      <Pencil className="w-4 h-4 inline" /> 编辑
                    </button>
                    <button onClick={() => handleDelete(cat.id)} className="text-red-500 hover:underline">
                      <Trash2 className="w-4 h-4 inline" /> 删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && (
          <div className="p-8 text-center text-surface-500">暂无类别</div>
        )}
      </div>
    </div>
  );
}