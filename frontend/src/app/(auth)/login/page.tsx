'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
  const [agreed, setAgreed] = useState(false);

  const handleMindAuthLogin = () => {
    if (!agreed) return;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || 'forum';
    const redirectPath = new URLSearchParams(window.location.search).get('redirect') || '/';

    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 to-surface-100 dark:from-surface-900 dark:to-surface-800 p-4">
      <div className="w-full max-w-md bg-card rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">登录到论坛</h1>
          <p className="text-muted-foreground">使用论坛账号登录</p>
        </div>

        <Button onClick={handleMindAuthLogin} className="w-full" size="lg" disabled={!agreed}>
          <MessageSquare className="mr-2 h-5 w-5" />
          使用论坛账号登录
        </Button>

        <label className="mt-6 flex items-start gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-surface-300"
          />
          <span>
            我已阅读并同意{' '}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              服务条款
            </Link>
            {' '}和{' '}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              隐私政策
            </Link>
          </span>
        </label>
      </div>
    </div>
  );
}
