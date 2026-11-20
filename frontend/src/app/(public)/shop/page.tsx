'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api/client';
import Link from 'next/link';
import { ShoppingBag, Star, Lock, Package } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import FeatureGate from '@/components/forum/feature-gate';
import { useI18n } from '@/i18n/provider';

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
  const { t, locale } = useI18n();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPoints, setMyPoints] = useState(0);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'shop' | 'purchases'>('shop');
  const [purchases, setPurchases] = useState<any[]>([]);

  const fetchItems = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<{ data: ShopItem[] }>('/api/shop/items?page=1&limit=50');
      setItems((res.data || []).filter((i: ShopItem) => i.is_active));
    } catch (err) {
      // Previously a `console.error` only, which made a failed load indistinguishable
      // from an empty shop — and the endpoint's response shape meant it always failed.
      setError(err instanceof Error ? err.message : t('points.loadFailed'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchMyPoints = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const data = await api.get<{ available_points?: number; total_points?: number }>('/api/points/me');
      setMyPoints(data.available_points || data.total_points || 0);
    } catch {}
  }, [isAuthenticated, user]);

  const fetchMyPurchases = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const res = await api.get<{ data: any[] }>('/api/shop/me/purchases?page=1&limit=20');
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
      await api.post(`/api/shop/purchase/${itemId}`);
      setMessage(t('points.purchaseSuccess'));
      setTimeout(() => setMessage(null), 3000);
      fetchMyPoints();
      fetchMyPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('points.purchaseFailed'));
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) return (
    <FeatureGate settingKey="feature_shop_enabled" label={t('points.shop')}>
    <div>
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    </div>
    </FeatureGate>
  );

  return (
    <FeatureGate settingKey="feature_shop_enabled" label={t('points.shop')}>
    <div>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary">{t('navigation.home')}</Link>
            <span>/</span>
            <span>{t('points.shop')}</span>
          </nav>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="w-7 h-7 text-primary" />
              {t('points.shop')}
            </h1>
            <p className="text-muted-foreground mt-1">{t('points.shopIntro')}</p>
          </div>
          {isAuthenticated && (
            <div className="card px-5 py-3 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <span className="font-bold text-lg">{myPoints}</span>
              <span className="text-sm text-muted-foreground">{t('points.available')}</span>
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
                tab === 'shop' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab('shop')}
            >
              {t('points.allItems')}
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === 'purchases' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab('purchases')}
            >
              {t('points.myRedemptions')}
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
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-primary font-bold">
                      <Star className="w-4 h-4" />
                      {item.points_cost} {t('points.points')}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.stock > 0 ? `${t('points.stock')} ${item.stock}` : t('points.soldOut')}
                    </span>
                  </div>
                  {isAuthenticated ? (
                    <button
                      onClick={() => handlePurchase(item.id)}
                      disabled={purchasing === item.id || item.stock === 0 || myPoints < item.points_cost}
                      className="mt-3 w-full btn btn-primary text-sm"
                    >
                      {purchasing === item.id ? t('points.buying') : item.stock === 0 ? t('points.soldOut') : myPoints < item.points_cost ? t('points.insufficient') : t('points.buy')}
                    </button>
                  ) : (
                    <a
                      href={`/login?redirect=${encodeURIComponent('/shop')}`}
                      className="mt-3 w-full btn btn-secondary text-sm flex items-center justify-center gap-1"
                    >
                      <Lock className="w-3 h-3" /> {t('points.loginToRedeem')}
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
              <div className="text-center py-16 text-muted-foreground">
                <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p>{t('points.noRedemptions')}</p>
              </div>
            ) : (
              purchases.map((p) => (
                <div key={p.id} className="card p-4 flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{p.item?.name || t('points.item')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('points.redeemedOn', { date: new Date(p.created_at).toLocaleDateString(locale) })}
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
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>{t('points.empty')}</p>
          </div>
        )}
      </main>
    </div>
    </FeatureGate>
  );
}
