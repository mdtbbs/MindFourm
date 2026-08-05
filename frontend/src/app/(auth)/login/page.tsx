'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

export default function LoginPage() {
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
  const [qqLoginEnabled, setQqLoginEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    // 检查 QQ 登录功能是否启用
    fetch('/api/qq-auth/status')
      .then(res => res.json())
      .then(data => {
        setQqLoginEnabled(data.data?.enabled || false);
      })
      .catch(() => {
        setQqLoginEnabled(false);
      });
  }, []);

  const handleMindAuthLogin = () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || 'forum';
    const redirectPath = new URLSearchParams(window.location.search).get('redirect') || '/';

    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath)}`;
  };

  const handleQQLogin = async () => {
    try {
      const response = await fetch('/api/qq-auth/authorize');
      const data = await response.json();

      if (data.success && data.data?.authorize_url) {
        window.location.href = data.data.authorize_url;
      } else {
        console.error('Failed to get QQ authorize URL:', data);
        alert('获取 QQ 授权链接失败，请稍后重试');
      }
    } catch (error) {
      console.error('QQ login error:', error);
      alert('QQ 登录失败，请稍后重试');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 to-surface-100 dark:from-surface-900 dark:to-surface-800 p-4">
      <div className="w-full max-w-md bg-card rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">登录到论坛</h1>
          <p className="text-muted-foreground">选择您喜欢的登录方式</p>
        </div>

        <div className="space-y-4">
          {/* MindAuth 登录按钮 */}
          <Button
            onClick={handleMindAuthLogin}
            className="w-full"
            size="lg"
          >
            <MessageSquare className="mr-2 h-5 w-5" />
            使用论坛账号登录
          </Button>

          {/* QQ 登录按钮（功能开关控制） */}
          {qqLoginEnabled && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">或</span>
                </div>
              </div>

              <Button
                onClick={handleQQLogin}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 3.5C13.66 3.5 15 4.84 15 6.5C15 8.16 13.66 9.5 12 9.5C10.34 9.5 9 8.16 9 6.5C9 4.84 10.34 3.5 12 3.5ZM12 20.5C7.58 20.5 4 17.42 4 13.5C4 12.06 4.58 10.73 5.5 9.5C6.42 10.73 9.08 11.5 12 11.5C14.92 11.5 17.58 10.73 18.5 9.5C19.42 10.73 20 12.06 20 13.5C20 17.42 16.42 20.5 12 20.5Z" fill="#12B7F5"/>
                </svg>
                使用 QQ 登录
              </Button>
            </>
          )}

          {/* 加载中状态 */}
          {qqLoginEnabled === null && (
            <div className="text-center text-sm text-muted-foreground">
              正在加载登录选项...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
