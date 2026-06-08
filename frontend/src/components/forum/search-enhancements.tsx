'use client';

import { useEffect, useState, useCallback } from 'react';
import { searchApi } from '@/lib/api/client';
import Link from 'next/link';
import { Clock, TrendingUp } from 'lucide-react';

export default function SearchEnhancements() {
  const [history, setHistory] = useState<any[]>([]);
  const [popular, setPopular] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [popularRes, historyRes] = await Promise.all([
        searchApi.getPopular().catch(() => ({ data: [] })),
        searchApi.getHistory().catch(() => ({ data: [] })),
      ]);
      setPopular(popularRes.data || []);
      setHistory(historyRes.data || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClearHistory = async () => {
    await searchApi.clearHistory().catch(() => {});
    setHistory([]);
  };

  const handleClick = (query: string) => {
    window.location.href = `/search?q=${encodeURIComponent(query)}`;
  };

  if (loading) return null;

  return (
    <div className="mt-8 space-y-6">
      {history.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4" />
              最近搜索
            </h3>
            <button onClick={handleClearHistory} className="text-xs text-muted hover:text-primary">
              清空
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => handleClick(h.query)}
                className="px-3 py-1.5 text-sm bg-surface-100 hover:bg-surface-200 rounded-full transition-colors"
              >
                {h.query}
              </button>
            ))}
          </div>
        </div>
      )}

      {popular.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4" />
            热门搜索
          </h3>
          <div className="flex flex-wrap gap-2">
            {popular.map((q, i) => (
              <button
                key={i}
                onClick={() => handleClick(q)}
                className="px-3 py-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-full transition-colors"
              >
                {i < 3 ? '🔥 ' : ''}{q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
