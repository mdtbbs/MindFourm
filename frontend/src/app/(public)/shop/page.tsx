'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import UnifiedHeader from '@/components/layout/unified-header';
import Link from 'next/link';
import { ShoppingBag, Star, Lock, Package } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';

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

export default function ShopPage() {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPoints, setMyPoints] = useState(0);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'shop' | 'purchases'>('shop');
  const [purchases, setPurchases] = useState<any[]>([]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await api.get('/shop/items?page=1&limit=50');
      setItems((res.data || []).filter((i: ShopItem) => i.is_active));
    } catch (err) {
      console.error('Failed to load shop:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyPoints = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const data = await api.get('/points/me');
      setMyPoints(data.available_points || data.total_points || 0);
    } catch {}
  }, [isAuthenticated, user]);

  const fetchMyPurchases = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const res = await api.get(`/shop/me/purchases?userId=${user.id}&page=1&limit=20`);
      setPurchases(res.data || []);
    } catch {}
  }, [isAuthenticated, user]);

  useEffect(() => {
    fetchItems();
    fetchMyPoints();
    fetchMyPurchases();
  }, [fetchItems, fetchMyPoints, fetchMyPurchases]);

  const handlePurchase = async (itemId: number) => {
    if (!isAuthenticated || !user) return;
    setPurchasing(itemId);
    setError(null);
    try {
      await api.post(`/shop/purchase/${itemId}?userId=${user.id}`);
      setMessage('购买成功！');
      setTimeout(() => setMessage(null), 3000);
      fetchMyPoints();
      fetchMyPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : '购买失败');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)]">
      <UnifiedHeader />
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <UnifiedHeader />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link href="/" className="hover:text-primary">首页</Link>
            <span>/</span>
            <span>积分商城</span>
          </nav>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="w-7 h-7 text-primary" />
              积分商城
            </h1>
            <p className="text-muted mt-1">使用积分兑换精美礼品</p>
          </div>
          {isAuthenticated && (
            <div className="card px-5 py-3 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <span className="font-bold text-lg">{myPoints}</span>
              <span className="text-sm text-muted">可用积分</span>
            </div>
          )}
        </div>

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        {isAuthenticated && (
          <div className="flex gap-4 mb-6 border-b border-border">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'shop' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text'
              }`}
              onClick={() => setTab('shop')}
            >
              全部商品
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'purchases' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text'
              }`}
              onClick={() => setTab('purchases')}
            >
              我的兑换
            </button>
          </div>
        )}

        {tab === 'shop' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div key={item.id} className="card overflow-hidden hover:shadow-lg transition-shadow">
                {item.image_url ? (
                  <div className="h-40 bg-surface-100 overflow-hidden">
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                    <Package className="w-12 h-12 text-primary/40" />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold mb-1">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-muted line-clamp-2 mb-3">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-primary font-bold">
                      <Star className="w-4 h-4" />
                      {item.points_cost} 积分
                    </div>
                    <span className="text-xs text-muted">
                      {item.stock > 0 ? `库存 ${item.stock}` : '已售罄'}
                    </span>
                  </div>
                  {isAuthenticated ? (
                    <button
                      onClick={() => handlePurchase(item.id)}
                      disabled={purchasing === item.id || item.stock === 0 || myPoints < item.points_cost}
                      className="mt-3 w-full btn btn-primary text-sm"
                    >
                      {purchasing === item.id ? '兑换中...' : item.stock === 0 ? '已售罄' : myPoints < item.points_cost ? '积分不足' : '立即兑换'}
                    </button>
                  ) : (
                    <a
                      href={`/login?redirect=${encodeURIComponent('/shop')}`}
                      className="mt-3 w-full btn btn-secondary text-sm flex items-center justify-center gap-1"
                    >
                      <Lock className="w-3 h-3" /> 登录后兑换
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'purchases' && isAuthenticated && (
          <div className="space-y-3">
            {purchases.length === 0 ? (
              <div className="text-center py-16 text-muted">
                <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p>暂无兑换记录</p>
              </div>
            ) : (
              purchases.map((p) => (
                <div key={p.id} className="card p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{p.item?.name || '商品'}</h3>
                    <p className="text-sm text-muted">
                      兑换于 {new Date(p.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-primary font-bold">
                    <Star className="w-4 h-4" />
                    {p.item?.points_cost || p.points_cost}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {items.length === 0 && tab === 'shop' && (
          <div className="text-center py-16 text-muted">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>暂无商品，管理员可在后台添加</p>
          </div>
        )}
      </main>
    </div>
  );
}
