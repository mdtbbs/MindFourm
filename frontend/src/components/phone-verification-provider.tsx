'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ShieldCheck, X } from 'lucide-react';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi, smsApi } from '@/lib/api/client';
import { registerPhoneVerificationHandler } from '@/lib/phone-verification/coordinator';
import { useUserStore } from '@/store/user-store';
import { useToastStore } from '@/store/toast-store';

type PendingRequest = {
  resolve: (verified: boolean) => void;
};

type SendCodeResult = {
  phone_verified?: boolean;
};

const PHONE_RE = /^1[3-9]\d{9}$/;
const PHONE_VERIFICATION_NOTICE_ID = 'phone-verification-required';
const PHONE_VERIFICATION_NOTICE = '请先验证手机号后再发布内容或使用互动功能。点击此提示即可开始验证。';

export function PhoneVerificationProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const pendingRef = useRef<PendingRequest[]>([]);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const showSuccess = useToastStore((state) => state.showSuccess);
  const showPersistentToast = useToastStore((state) => state.showPersistentToast);
  const dismissToast = useToastStore((state) => state.dismissToast);
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('[data-toast-dismiss]')) return;
      if (target.closest(`[data-toast-id="${PHONE_VERIFICATION_NOTICE_ID}"]`)) setOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    registerPhoneVerificationHandler(() => {
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        pendingRef.current.push({ resolve });
      });
    });

    return () => registerPhoneVerificationHandler(null);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (user && !user.phone_verified) {
      showPersistentToast(PHONE_VERIFICATION_NOTICE_ID, PHONE_VERIFICATION_NOTICE, 'warning');
      return;
    }

    dismissToast(PHONE_VERIFICATION_NOTICE_ID);
  }, [dismissToast, pathname, showPersistentToast, user]);

  const close = (verified = false) => {
    for (const pending of pendingRef.current) {
      pending.resolve(verified);
    }
    pendingRef.current = [];
    setOpen(false);
    setError('');
    setPhone('');
    setCode('');
    setStep('phone');
    setCountdown(0);
  };

  const syncPhoneStatus = async () => {
    try {
      const result = await authApi.syncPhoneStatus();
      setUser(result.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message) {
        throw new Error(`手机号已验证，但论坛状态同步失败：${message}`);
      }
      throw new Error('手机号已验证，但论坛状态同步失败，请稍后重试');
    }
  };

  const sendCode = async () => {
    setError('');
    if (!PHONE_RE.test(phone)) {
      setError('请输入正确的中国大陆手机号');
      return;
    }

    setLoading(true);
    try {
      const result = await smsApi.send(phone) as SendCodeResult;
      if (result.phone_verified) {
        await syncPhoneStatus();
        showSuccess('手机号验证成功');
        close(true);
        return;
      }
      setStep('code');
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位数字验证码');
      return;
    }

    setLoading(true);
    try {
      await smsApi.verify(phone, code);
      await syncPhoneStatus();
      showSuccess('手机号验证成功');
      close(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {children}
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[var(--primary)]" />
                <div>
                  <h2 className="text-base font-semibold text-[var(--text)]">验证手机号</h2>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    验证成功后会自动继续本次操作
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {error && (
                <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              {step === 'phone' ? (
                <>
                  <Input
                    label="手机号"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="请输入 11 位手机号"
                    maxLength={11}
                    autoFocus
                  />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={loading || phone.length !== 11}
                    onClick={sendCode}
                  >
                    {loading ? '发送中...' : '发送验证码'}
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-sm text-[var(--text-secondary)]">
                    验证码已发送至 <span className="font-medium text-[var(--text)]">{phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span>
                  </div>
                  <Input
                    label="验证码"
                    inputMode="numeric"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="请输入 6 位验证码"
                    maxLength={6}
                    autoFocus
                  />
                  <div className="flex items-center justify-between text-sm">
                    {countdown > 0 ? (
                      <span className="text-[var(--text-muted)]">{countdown} 秒后可重新发送</span>
                    ) : (
                      <button type="button" className="text-[var(--primary)] hover:underline" onClick={sendCode}>
                        重新发送
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-[var(--text-secondary)] hover:text-[var(--text)]"
                      onClick={() => {
                        setStep('phone');
                        setCode('');
                        setError('');
                      }}
                    >
                      更换手机号
                    </button>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={loading || code.length !== 6}
                    onClick={verifyCode}
                  >
                    {loading ? '验证中...' : '验证并继续'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
