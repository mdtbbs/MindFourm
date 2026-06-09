'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { Package, Plus, Edit, Trash2 } from 'lucide-react';

interface ShopItem {
  id: number;
  name: string;
  description: string | null;
  points_cost: number;
  stock: number;
  image_url: string | null;
  is_active: number;
  sort_order: number;
}

export default function AdminShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', points_cost: 0, stock: 0, image_url: '', sort_order: 0, is_active: 1 });

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.get<ShopItem[]>('/shop/admin/items');
      setItems(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载商品失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const resetForm = () => {
    setFormData({ name: '', description: '', points_cost: 0, stock: 0, image_url: '', sort_order: 0, is_active: 1 });
    setEditing(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!formData.name) { setError('请填写商品名称'); return; }
    try {
      const body = { ...formData, image_url: formData.image_url || null, description: formData.description || null };
      if (editing) {
        await api.put(`/shop/admin/items/${editing.id}`, body);
        setMessage('商品已更新');
      } else {
        await api.post('/shop/admin/items', body);
        setMessage('商品已创建');
      }
      resetForm();
      setShowForm(false);
      setTimeout(() => setMessage(null), 3000);
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此商品吗？')) return;
    try {
      await api.delete(`/shop/admin/items/${id}`);
      setMessage('商品已删除');
      setTimeout(() => setMessage(null), 3000);
      await fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleEdit = (item: ShopItem) => {
    setEditing(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      points_cost: item.points_cost,
      stock: item.stock,
      image_url: item.image_url || '',
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
    setShowForm(true);
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">商城管理</h1>
          <p className="text-sm text-surface-500 mt-1">管理积分商城商品，设置兑换价格和库存</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} variant="default">
          <Plus className="w-4 h-4 mr-1" />
          添加商品
        </Button>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-surface-200 rounded p-6">
          <h3 className="text-sm font-semibold mb-4">{editing ? '编辑商品' : '添加商品'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">商品名称 *</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">描述</label>
              <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm" rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">积分价格 *</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.points_cost} onChange={(e) => setFormData({ ...formData, points_cost: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">库存</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">图片 URL</label>
              <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">排序</label>
              <input type="number" className="w-full px-3 py-2 border border-surface-200 rounded text-sm" value={formData.sort_order} onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formData.is_active === 1} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })} />
                上架
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSubmit} variant="default">{editing ? '保存修改' : '创建商品'}</Button>
            <Button onClick={() => { setShowForm(false); resetForm(); }} variant="secondary">取消</Button>
          </div>
        </div>
      )}

      {/* Item list */}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className={`bg-white border border-surface-200 rounded p-4 flex items-center gap-4 ${item.is_active === 0 ? 'opacity-60' : ''}`}>
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="w-14 h-14 rounded-lg object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-surface-100 flex items-center justify-center">
                <Package className="w-6 h-6 text-surface-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{item.name}</h3>
                {item.is_active === 0 && <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded">已下架</span>}
              </div>
              {item.description && <p className="text-sm text-surface-500 mt-0.5 line-clamp-1">{item.description}</p>}
              <div className="flex items-center gap-4 mt-1 text-sm text-surface-500">
                <span className="flex items-center gap-1">⭐ {item.points_cost} 积分</span>
                <span>库存: {item.stock}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleEdit(item)}>
                <Edit className="w-3 h-3 mr-1" /> 编辑
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
                <Trash2 className="w-3 h-3 mr-1" /> 删除
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center py-12 text-surface-500">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>暂无商品</p>
          </div>
        )}
      </div>
    </div>
  );
}
