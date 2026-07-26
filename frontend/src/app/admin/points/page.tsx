'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { Star, Plus, Edit, Trash2 } from 'lucide-react';

interface PointRule {
  id: number;
  action: string;
  points: number;
  description: string | null;
  target_type: string | null;
  cooldown_seconds: number | null;
}

const ACTION_LABELS: Record<string, string> = {
  create_post: '发帖',
  create_reply: '回复',
  get_like: '获得点赞',
  give_like: '点赞他人',
  login_daily: '每日签到',
  report_content: '举报内容',
};

export default function AdminPointsPage() {
  const [rules, setRules] = useState<PointRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PointRule | null>(null);
  const [formData, setFormData] = useState({ action: '', points: 0, description: '', cooldown_seconds: '' });

  const fetchRules = useCallback(async () => {
    try {
      const data = await api.get<PointRule[]>('/api/points/admin/rules');
      setRules(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载积分规则失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const resetForm = () => {
    setFormData({ action: '', points: 0, description: '', cooldown_seconds: '' });
    setEditing(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!formData.action) { setError('请选择操作类型'); return; }
    try {
      const body = {
        ...formData,
        cooldown_seconds: formData.cooldown_seconds ? parseInt(formData.cooldown_seconds) : null,
      };
      if (editing) {
        await api.put(`/api/points/admin/rules/${editing.id}`, body);
        setMessage('规则已更新');
      } else {
        await api.post('/api/points/admin/rules', body);
        setMessage('规则已创建');
      }
      resetForm();
      setShowForm(false);
      setTimeout(() => setMessage(null), 3000);
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此规则吗？')) return;
    try {
      await api.delete(`/api/points/admin/rules/${id}`);
      setMessage('规则已删除');
      setTimeout(() => setMessage(null), 3000);
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleEdit = (rule: PointRule) => {
    setEditing(rule);
    setFormData({
      action: rule.action,
      points: rule.points,
      description: rule.description || '',
      cooldown_seconds: rule.cooldown_seconds?.toString() || '',
    });
    setShowForm(true);
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500" />
            积分规则
          </h1>
          <p className="text-sm text-surface-500 mt-1">管理积分获取和扣除规则</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} variant="default">
          <Plus className="w-4 h-4 mr-1" />
          添加规则
        </Button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-surface-200 rounded p-6">
          <h3 className="text-sm font-semibold mb-4">{editing ? '编辑规则' : '添加规则'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">操作类型 *</label>
              <select className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.action} onChange={(e) => setFormData({ ...formData, action: e.target.value })}>
                <option value="">选择操作</option>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">积分</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.points} onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })} placeholder="负数表示扣除" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">冷却时间（秒）</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.cooldown_seconds} onChange={(e) => setFormData({ ...formData, cooldown_seconds: e.target.value })} placeholder="留空表示无冷却" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">描述</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="规则说明（可选）" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSubmit} variant="default">{editing ? '保存修改' : '创建规则'}</Button>
            <Button onClick={() => { setShowForm(false); resetForm(); }} variant="secondary">取消</Button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-2">
        {rules.map((rule) => (
          <div key={rule.id} className="bg-white border border-surface-200 rounded p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rule.points >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              <Star className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{ACTION_LABELS[rule.action] || rule.action}</h3>
                <span className={`text-sm font-bold ${rule.points >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {rule.points >= 0 ? '+' : ''}{rule.points} 积分
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-surface-500">
                {rule.description && <span>{rule.description}</span>}
                {rule.cooldown_seconds && <span>冷却 {rule.cooldown_seconds}s</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleEdit(rule)}>
                <Edit className="w-3 h-3 mr-1" /> 编辑
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(rule.id)}>
                <Trash2 className="w-3 h-3 mr-1" /> 删除
              </Button>
            </div>
          </div>
        ))}
        {rules.length === 0 && (
          <div className="text-center py-12 text-surface-500">
            <Star className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>暂无积分规则</p>
          </div>
        )}
      </div>
    </div>
  );
}
