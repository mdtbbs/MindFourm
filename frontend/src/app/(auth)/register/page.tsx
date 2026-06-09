'use client';

import { useEffect } from 'react';

function createState(returnTo: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  document.cookie = `oauth_state_nonce=${nonce}; Max-Age=600; Path=/; SameSite=Lax`;
  return `${nonce}.${encodeURIComponent(returnTo)}`;
}

function getSafeReturnTo(): string {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('returnTo');
  const fallback = '/';
  const candidate = requested || fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('://')) return fallback;
  if (candidate.startsWith('/login') || candidate.startsWith('/register') || candidate.startsWith('/callback')) return fallback;
  return candidate;
}

export default function RegisterPage() {
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

  useEffect(() => {
    const redirectUrl = encodeURIComponent(`${window.location.origin}/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || '';
    const state = createState(getSafeReturnTo());
    window.location.href = `${mindauthUrl}/register?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(state)}`;
  }, [mindauthUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-surface-500">正在跳转到注册页面...</p>
    </div>
  );
}
