'use client';

import { useEffect, useState, useCallback } from 'react';
import { levelsApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { Star, Plus, Edit, Trash2 } from 'lucide-react';

interface Level {
  id: number;
  name: string;
  slug: string;
  min_points: number;
  max_points: number | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  sort_order: number;
}

export default function AdminLevelsPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Level | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '', min_points: 0, max_points: '', color: '', description: '', sort_order: 0 });

  const fetchLevels = useCallback(async () => {
    try {
      const data = await levelsApi.adminGetAll();
      setLevels((data || []).sort((a: Level, b: Level) => a.sort_order - b.sort_order));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载等级失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLevels(); }, [fetchLevels]);

  const resetForm = () => {
    setFormData({ name: '', slug: '', min_points: 0, max_points: '', color: '', description: '', sort_order: 0 });
    setEditing(null);
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      const body = {
        name: formData.name,
        slug: formData.slug,
        min_points: formData.min_points,
        max_points: formData.max_points ? parseInt(formData.max_points) : undefined,
        color: formData.color || undefined,
        description: formData.description || undefined,
        sort_order: formData.sort_order || 0,
      };
      if (editing) {
        await levelsApi.adminUpdate(editing.id, body);
        setMessage('等级已更新');
      } else {
        await levelsApi.adminCreate(body);
        setMessage('等级已创建');
      }
      resetForm();
      setShowForm(false);
      setTimeout(() => setMessage(null), 3000);
      await fetchLevels();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此等级吗？')) return;
    try {
      await levelsApi.adminDelete(id);
      setMessage('等级已删除');
      setTimeout(() => setMessage(null), 3000);
      await fetchLevels();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleEdit = (level: Level) => {
    setEditing(level);
    setFormData({
      name: level.name,
      slug: level.slug,
      min_points: level.min_points,
      max_points: level.max_points?.toString() || '',
      color: level.color || '',
      description: level.description || '',
      sort_order: level.sort_order,
    });
    setShowForm(true);
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">等级管理</h1>
          <p className="text-sm text-surface-500 mt-1">管理用户等级体系，根据积分自动分配</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} variant="default">
          <Plus className="w-4 h-4 mr-1" />
          添加等级
        </Button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-surface-200 rounded p-6">
          <h3 className="text-sm font-semibold mb-4">{editing ? '编辑等级' : '添加等级'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">等级名称 *</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">标识 *</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder="例如：novice" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">最低积分 *</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.min_points} onChange={(e) => setFormData({ ...formData, min_points: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">最高积分</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.max_points} onChange={(e) => setFormData({ ...formData, max_points: e.target.value })} placeholder="留空表示无上限" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">颜色</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-9 border border-surface-200 rounded cursor-pointer" value={formData.color || '#3b82f6'} onChange={(e) => setFormData({ ...formData, color: e.target.value })} />
                <input className="flex-1 px-3 py-2 border border-surface-200 rounded text-sm" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} placeholder="#3b82f6" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">排序</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.sort_order} onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">描述</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="等级描述（可选）" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSubmit} variant="default">{editing ? '保存修改' : '创建等级'}</Button>
            <Button onClick={() => { setShowForm(false); resetForm(); }} variant="secondary">取消</Button>
          </div>
        </div>
      )}

      {/* Level list */}
      <div className="space-y-2">
        {levels.map((level) => (
          <div key={level.id} className="bg-white border border-surface-200 rounded p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: level.color || 'var(--primary)' }}>
              {level.icon ? <img src={level.icon} alt="" className="w-6 h-6" /> : <Star className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{level.name}</h3>
                <span className="text-xs bg-surface-100 text-surface-500 px-2 py-0.5 rounded font-mono">{level.slug}</span>
              </div>
              <p className="text-sm text-surface-500 mt-0.5">
                {level.min_points} ~ {level.max_points ? level.max_points : '∞'} 积分
                {level.description && ` · ${level.description}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleEdit(level)}>
                <Edit className="w-3 h-3 mr-1" /> 编辑
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(level.id)}>
                <Trash2 className="w-3 h-3 mr-1" /> 删除
              </Button>
            </div>
          </div>
        ))}
        {levels.length === 0 && (
          <div className="text-center py-12 text-surface-500">
            <Star className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>暂无等级</p>
          </div>
        )}
      </div>
    </div>
  );
}
