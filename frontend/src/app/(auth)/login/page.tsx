'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const redirectUrl = encodeURIComponent(`${apiBase}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || '';
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(currentPath || '/')}`;
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-surface-500">正在跳转到登录页面...</p>
    </div>
  );
}
