'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Alert from '@/components/ui/alert';
import { Loader2, ShieldCheck } from 'lucide-react';

const AUTH_CHECK_TIMEOUT_MS = 8_000;

function readCsrfToken(): string | undefined {
  const pair = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('csrf_token='));
  return pair ? decodeURIComponent(pair.slice('csrf_token='.length)) : undefined;
}

async function postTerms(token: string | null, accepted: boolean): Promise<string> {
  let csrfToken = readCsrfToken();
  if (!csrfToken) {
    await fetch('/api/auth/check', { credentials: 'include' });
    csrfToken = readCsrfToken();
  }
  const body = token ? { token, accepted } : { accepted };
  const response = await fetch('/api/auth/accept-terms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(body),
    credentials: 'include',
    redirect: 'follow',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || `请求失败 (${response.status})`);
  }
  const data = await response.json().catch(() => ({}));
  return typeof data?.redirectPath === 'string' ? data.redirectPath : '/';
}

export default function AcceptTermsPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [summary, setSummary] = useState<string>('使用本站前请阅读并同意我们的服务条款与隐私政策。');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(!token); // If token flow, skip session check
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Pull the admin-configured summary line from public settings (best-effort;
    // if the fetch fails, the seeded default above is used).
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        const s = data?.data?.terms_summary;
        if (typeof s === 'string' && s.trim()) setSummary(s);
      })
      .catch(() => {
        /* keep default */
      });
  }, []);

  useEffect(() => {
    // Session flow (no token): verify the user is logged in before showing the form.
    if (token) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AUTH_CHECK_TIMEOUT_MS);

    fetch('/api/auth/check', { credentials: 'include', signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const authenticated = !!data?.authenticated;
        setIsAuthenticated(authenticated);
        setAuthChecked(true);

        // Terms enforcement may be disabled while an older bookmark, browser
        // redirect or a stale client still points here. Do not leave the user on
        // an obsolete consent screen in that case.
        if (authenticated && !data?.needs_terms_acceptance) {
          window.location.replace('/');
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        setAuthChecked(true);
        setError('登录状态检查超时或暂时不可用，请返回首页后重试。');
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [token]);

  const handleSubmit = useCallback(
    (accepted: boolean) => {
      setSubmitting(true);
      setError(null);

      // POSTing with redirect: 'manual' lets the browser follow the 302 back
      // to the forum root or the original target page.
      postTerms(token, accepted)
        .then((redirectPath) => {
          window.location.href = redirectPath;
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : '请求失败，请重试');
          setSubmitting(false);
        });
    },
    [token],
  );

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card rounded-lg shadow-lg p-8 text-center">
          <Loader2 className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-spin" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  // Token flow: token is required
  // Session flow: must be authenticated
  if (token) {
    // Token flow — token present, proceed to form below
  } else if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card rounded-lg shadow-lg p-8 text-center">
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-xl font-bold mb-2">未登录</h1>
          <p className="text-muted-foreground mb-6">请先登录后再接受条款。</p>
          <Link href="/login">
            <Button>返回登录</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 to-surface-100 dark:from-surface-900 dark:to-surface-800 p-4">
      <div className="w-full max-w-lg bg-card rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <ShieldCheck className="h-12 w-12 mx-auto text-primary mb-3" />
          <h1 className="text-2xl font-bold mb-2">请阅读并同意以下条款</h1>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>

        {error && <Alert type="error" message={error} />}

        <div className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-4 mb-6 max-h-64 overflow-y-auto text-sm leading-relaxed">
          <p className="mb-2">
            点击"我已阅读并同意"即表示你同意{' '}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
              服务条款
            </Link>
            {' '}和{' '}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
              隐私政策
            </Link>
            。
          </p>
          <p className="text-muted-foreground">
            如果你不同意，可以点击"不同意"退出；你将无法继续使用本站。
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm mb-6 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-4 w-4 rounded border-surface-300"
          />
          <span>我已阅读并同意上述条款</span>
        </label>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
          >
            不同意
          </Button>
          <Button
            className="flex-1"
            onClick={() => handleSubmit(true)}
            disabled={submitting || !agreed}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                处理中...
              </>
            ) : (
              '我已阅读并同意'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
