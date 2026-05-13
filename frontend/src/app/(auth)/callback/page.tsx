'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api/client';

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams?.get('code');
    const state = searchParams?.get('state');

    if (!code) {
      setError('登录失败：缺少授权码');
      setTimeout(() => router.push('/'), 3000);
      return;
    }

    // After backend sets the session cookie, verify it's active
    authApi.check()
      .then((result) => {
        if (result.authenticated) {
          const redirectPath = state ? decodeURIComponent(state) : '/';
          router.push(redirectPath);
        } else {
          setError('登录失败：会话未建立');
          setTimeout(() => router.push('/'), 3000);
        }
      })
      .catch(() => {
        setError('登录失败：无法验证会话');
        setTimeout(() => router.push('/'), 3000);
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-surface-500">3 秒后返回首页</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
        <p className="text-surface-500">登录成功，正在验证...</p>
      </div>
    </div>
  );
}
