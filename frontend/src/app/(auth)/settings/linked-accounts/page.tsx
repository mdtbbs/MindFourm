'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { User } from '@/types';
import { Loader2, Link2, Unlink } from 'lucide-react';
import { useToastStore } from '@/store/toast-store';

export default function LinkedAccountsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [binding, setBinding] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [qqLoginEnabled, setQqLoginEnabled] = useState(false);
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showError = useToastStore((state) => state.showError);

  useEffect(() => {
    // 获取当前用户信息
    fetch('/api/auth/check')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setUser(data.data);
        }
      })
      .catch(err => {
        console.error('Failed to fetch user:', err);
        showError('获取用户信息失败');
      })
      .finally(() => setLoading(false));

    // 检查 QQ 登录功能是否启用
    fetch('/api/qq-auth/status')
      .then(res => res.json())
      .then(data => {
        setQqLoginEnabled(data.data?.enabled || false);
      })
      .catch(() => {
        setQqLoginEnabled(false);
      });
  }, [showError]);

  const handleBindQQ = async () => {
    try {
      setBinding(true);
      const response = await fetch('/api/qq-auth/authorize?bind=true');
      const data = await response.json();

      if (data.success && data.data?.authorize_url) {
        window.location.href = data.data.authorize_url;
      } else {
        throw new Error(data.message || '获取授权链接失败');
      }
    } catch (error) {
      console.error('Bind QQ error:', error);
      showError(error instanceof Error ? error.message : '绑定失败，请稍后重试');
    } finally {
      setBinding(false);
    }
  };

  const handleUnbindQQ = async () => {
    if (!confirm('确定要解绑 QQ 账号吗？解绑后将无法使用 QQ 登录。')) {
      return;
    }

    try {
      setUnbinding(true);
      const response = await fetch('/api/qq-auth/unbind', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        showSuccess('QQ 账号已成功解绑');
        // 重新获取用户信息
        const userResponse = await fetch('/api/auth/check');
        const userData = await userResponse.json();
        if (userData.success && userData.data) {
          setUser(userData.data);
        }
      } else {
        throw new Error(data.message || '解绑失败');
      }
    } catch (error) {
      console.error('Unbind QQ error:', error);
      showError(error instanceof Error ? error.message : '解绑失败，请稍后重试');
    } finally {
      setUnbinding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-muted-foreground">
          请先登录
        </div>
      </div>
    );
  }

  const isQQBound = !!user.qq_openid;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">关联账号</h1>

      {!qqLoginEnabled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 text-sm">
            QQ 登录功能当前未启用，请联系管理员开启。
          </p>
        </div>
      )}

      <div className="bg-card rounded-lg shadow p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">QQ 账号</h2>
            <p className="text-sm text-muted-foreground">
              绑定 QQ 账号后，可以使用 QQ 快速登录
            </p>
          </div>
          {isQQBound && (
            <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              已绑定
            </div>
          )}
        </div>

        {isQQBound ? (
          <div className="space-y-4">
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-4">
                {user.qq_avatar && (
                  <img
                    src={user.qq_avatar}
                    alt="QQ Avatar"
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div>
                  <div className="font-medium">
                    {user.qq_nickname || 'QQ 用户'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    绑定时间：{new Date().toLocaleDateString('zh-CN')}
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleUnbindQQ}
              variant="outline"
              disabled={unbinding || !qqLoginEnabled}
              className="w-full"
            >
              {unbinding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  解绑中...
                </>
              ) : (
                <>
                  <Unlink className="mr-2 h-4 w-4" />
                  解绑 QQ 账号
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <Unlink className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                尚未绑定 QQ 账号
              </p>
            </div>

            <Button
              onClick={handleBindQQ}
              disabled={binding || !qqLoginEnabled}
              className="w-full"
            >
              {binding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  绑定中...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  绑定 QQ 账号
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
