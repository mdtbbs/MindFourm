'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api/client';
import LoadingSpinner from '@/components/ui/loading-spinner';

/**
 * Constrain the OAuth `state` to a same-site path.
 *
 * `state` is attacker-controlled, and this page used to hand the decoded value
 * straight to `router.push` — so `?state=https%3A%2F%2Fevil.com` navigated off-site.
 * Mirrors `getSafeRedirectPath` in the backend's auth controller, which already had
 * this guard.
 *
 * Note: the OAuth flow points MindAuth at the backend `/api/auth/callback`, which
 * redirects on its own, so this page should be unreachable in practice. It is kept
 * (and hardened) rather than deleted because a stale `redirect_uri` registered for
 * the `forum` client in MindAuth could still land here.
 */
function getSafeRedirectPath(state: string | null | undefined): string {
  if (!state) return '/';

  let path = state;
  try {
    path = decodeURIComponent(state);
  } catch {
    return '/';
  }

  // Must be a site-relative path: reject absolute URLs, protocol-relative `//host`
  // and backslash tricks.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/';
  }

  return path;
}

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
          router.push(getSafeRedirectPath(state));
        } else {
          setError('登录失败：会话未建立');
          setTimeout(() => router.push('/'), 3000);
        }
      })
      .catch(() => {
        setError('登录失败：无法验证会话');
        setTimeout(() => router.push('/'), 3000);
      });
  }, [router, searchParams]);

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
        <div className="mx-auto mb-4">
          <LoadingSpinner variant="orbital" size="lg" />
        </div>
        <p className="text-surface-500">登录成功，正在验证...</p>
      </div>
    </div>
  );
}
