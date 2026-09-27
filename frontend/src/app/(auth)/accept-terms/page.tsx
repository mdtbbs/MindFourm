'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Alert from '@/components/ui/alert';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { siteProfile } from '@/config/site-profile';

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
    throw new Error(data?.message || `Request failed (${response.status})`);
  }
  const data = await response.json().catch(() => ({}));
  return typeof data?.redirectPath === 'string' ? data.redirectPath : '/';
}

export default function AcceptTermsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [summary, setSummary] = useState<string>(t('consent.summary'));
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(!token); // If token flow, skip session check
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Pull the admin-configured summary line from public settings (best-effort;
    // if the fetch fails, the seeded default above is used).
    if (siteProfile.profile !== 'mdtbbs') return;
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
        setError(t('consent.checkFailed'));
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [token, t]);

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
        .catch(() => {
          setError(t('consent.submitFailed'));
          setSubmitting(false);
        });
    },
    [token, t],
  );

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card rounded-lg shadow-lg p-8 text-center">
          <Loader2 className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-spin" />
          <p className="text-muted-foreground">{t('consent.checking')}</p>
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
          <h1 className="text-xl font-bold mb-2">{t('consent.title')}</h1>
          <p className="text-muted-foreground mb-6">{t('consent.loginRequired')}</p>
          <Link href="/login">
            <Button>{t('consent.login')}</Button>
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
          <h1 className="text-2xl font-bold mb-2">{t('consent.title')}</h1>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>

        {error && <Alert type="error" message={error} />}

        <div className="bg-surface-50 dark:bg-surface-900/50 rounded-lg p-4 mb-6 max-h-64 overflow-y-auto text-sm leading-relaxed">
          <p className="mb-2">
            {t('consent.termsIntro')}{' '}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
              {t('footer.terms')}
            </Link>
            {' '}{t('consent.and')}{' '}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
              {t('footer.privacy')}
            </Link>
            .
          </p>
          <p className="text-muted-foreground">
            {t('consent.disagree')}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm mb-6 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-4 w-4 rounded border-surface-300"
          />
          <span>{t('consent.checkbox')}</span>
        </label>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleSubmit(false)}
            disabled={submitting}
          >
            {t('consent.decline')}
          </Button>
          <Button
            className="flex-1"
            onClick={() => handleSubmit(true)}
            disabled={submitting || !agreed}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('consent.processing')}
              </>
            ) : (
              t('consent.accept')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
