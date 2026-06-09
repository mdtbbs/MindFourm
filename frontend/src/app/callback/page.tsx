'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/ui/loading-spinner';

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state') || '/';

    if (!code) {
      router.replace('/');
      return;
    }

    fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const returnTo = data.returnTo || '/';
          if (returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('://')) {
            router.refresh();
            router.replace(returnTo);
          } else {
            router.replace('/');
          }
        } else {
          setError(data.message || '登录失败');
        }
      })
      .catch(() => {
        setError('网络错误，请重试');
      });
  }, [searchParams, router]);

  const handleRetry = () => {
    const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || '';
    const currentPath = encodeURIComponent(window.location.pathname);
    window.location.href = `${mindauthUrl}/login?redirect=${encodeURIComponent('/callback')}&client_id=${clientId}&state=${currentPath}`;
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">登录失败</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            重新登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">正在登录...</p>
      </div>
    </div>
  );
}