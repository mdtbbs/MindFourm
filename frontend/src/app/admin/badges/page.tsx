'use client';

import { useEffect, useState, useCallback } from 'react';
import { badgesApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { Award, Plus, Edit, Trash2, Gift } from 'lucide-react';

interface Badge {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  level: string | null;
  criteria: string | null;
  is_active: number;
}

export default function AdminBadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Badge | null>(null);
  const [showAward, setShowAward] = useState(false);
  const [awardData, setAwardData] = useState({ user_id: '', badge_id: '' });
  const [formData, setFormData] = useState({ name: '', slug: '', icon: '', description: '', level: 'bronze', criteria: '', is_active: 1 });

  const fetchBadges = useCallback(async () => {
    try {
      const data = await badgesApi.adminGetAll();
      setBadges(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载徽章失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  const resetForm = () => {
    setFormData({ name: '', slug: '', icon: '', description: '', level: 'bronze', criteria: '', is_active: 1 });
    setEditing(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!formData.name || !formData.slug) { setError('请填写名称和标识'); return; }
    try {
      const body = { ...formData, criteria: formData.criteria || null, is_active: formData.is_active };
      if (editing) {
        await badgesApi.adminUpdate(editing.id, body);
        setMessage('徽章已更新');
      } else {
        await badgesApi.adminCreate(body);
        setMessage('徽章已创建');
      }
      resetForm();
      setShowForm(false);
      setTimeout(() => setMessage(null), 3000);
      await fetchBadges();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此徽章吗？')) return;
    try {
      await badgesApi.adminDelete(id);
      setMessage('徽章已删除');
      setTimeout(() => setMessage(null), 3000);
      await fetchBadges();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleAward = async () => {
    if (!awardData.user_id || !awardData.badge_id) { setError('请选择用户和徽章'); return; }
    try {
      await badgesApi.adminAward(parseInt(awardData.user_id), parseInt(awardData.badge_id));
      setMessage('徽章已授予');
      setShowAward(false);
      setAwardData({ user_id: '', badge_id: '' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '授予失败');
    }
  };

  const handleEdit = (badge: Badge) => {
    setEditing(badge);
    setFormData({
      name: badge.name,
      slug: badge.slug,
      icon: badge.icon || '',
      description: badge.description || '',
      level: badge.level || 'bronze',
      criteria: badge.criteria || '',
      is_active: badge.is_active,
    });
    setShowForm(true);
  };

  const levelColors: Record<string, string> = {
    bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', platinum: '#e5e4e2',
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">徽章管理</h1>
          <p className="text-sm text-surface-500 mt-1">管理用户徽章，可手动授予或设置自动获取条件</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAward(true)} variant="secondary">
            <Gift className="w-4 h-4 mr-1" /> 授予徽章
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(true); }} variant="primary">
            <Plus className="w-4 h-4 mr-1" /> 添加徽章
          </Button>
        </div>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Award form */}
      {showAward && (
        <div className="bg-white border border-surface-200 rounded p-6">
          <h3 className="text-sm font-semibold mb-4">授予徽章</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">用户 ID</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={awardData.user_id} onChange={(e) => setAwardData({ ...awardData, user_id: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">徽章</label>
              <select className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={awardData.badge_id} onChange={(e) => setAwardData({ ...awardData, badge_id: e.target.value })}>
                <option value="">选择徽章</option>
                {badges.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleAward} variant="primary">授予</Button>
            <Button onClick={() => setShowAward(false)} variant="secondary">取消</Button>
          </div>
        </div>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="bg-white border border-surface-200 rounded p-6">
          <h3 className="text-sm font-semibold mb-4">{editing ? '编辑徽章' : '添加徽章'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">徽章名称 *</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">标识 *</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} placeholder="例如：first-post" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">图标 URL</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">等级</label>
              <select className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.level} onChange={(e) => setFormData({ ...formData, level: e.target.value })}>
                <option value="bronze">铜牌</option>
                <option value="silver">银牌</option>
                <option value="gold">金牌</option>
                <option value="platinum">铂金</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">描述</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">获取条件（JSON）</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm font-mono" value={formData.criteria} onChange={(e) => setFormData({ ...formData, criteria: e.target.value })} placeholder='{"posts": 100}' />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formData.is_active === 1} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })} />
                启用此徽章
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSubmit} variant="primary">{editing ? '保存修改' : '创建徽章'}</Button>
            <Button onClick={() => { setShowForm(false); resetForm(); }} variant="secondary">取消</Button>
          </div>
        </div>
      )}

      {/* Badge list */}
      <div className="space-y-2">
        {badges.map((badge) => (
          <div key={badge.id} className={`bg-white border border-surface-200 rounded p-4 flex items-center gap-4 ${badge.is_active === 0 ? 'opacity-60' : ''}`}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: levelColors[badge.level || 'bronze'] || '#cd7f32' }}>
              {badge.icon ? <img src={badge.icon} alt="" className="w-6 h-6 rounded" /> : <Award className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{badge.name}</h3>
                <span className="text-xs bg-surface-100 text-surface-500 px-2 py-0.5 rounded font-mono">{badge.slug}</span>
                {badge.is_active === 0 && <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded">已禁用</span>}
              </div>
              {badge.description && <p className="text-sm text-surface-500 mt-0.5">{badge.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleEdit(badge)}>
                <Edit className="w-3 h-3 mr-1" /> 编辑
              </Button>
              <Button size="sm" variant="danger" onClick={() => handleDelete(badge.id)}>
                <Trash2 className="w-3 h-3 mr-1" /> 删除
              </Button>
            </div>
          </div>
        ))}
        {badges.length === 0 && (
          <div className="text-center py-12 text-surface-500">
            <Award className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>暂无徽章</p>
          </div>
        )}
      </div>
    </div>
  );
}
