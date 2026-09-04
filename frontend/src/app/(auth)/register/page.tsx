'use client';

import { useEffect } from 'react';

export default function RegisterPage() {
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

  useEffect(() => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || 'forum';
    const redirectPath = new URLSearchParams(window.location.search).get('redirect') || '/';

    window.location.href = `${mindauthUrl}/register?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath)}`;
  }, [mindauthUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-surface-500">正在跳转到注册页面...</p>
    </div>
  );
}
