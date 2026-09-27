'use client';

import Script from 'next/script';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { CommunityChallengeDescriptor } from '@/lib/api/client';
import { useI18n } from '@/i18n/provider';

declare global {
  interface Window {
    turnstile?: { render: (container: HTMLElement, options: Record<string, unknown>) => string; remove: (widgetId: string) => void };
    hcaptcha?: { render: (container: HTMLElement, options: Record<string, unknown>) => string; remove?: (widgetId: string) => void };
  }
}

export default function CommunityChallengeDialog({
  challenge,
  onCancel,
  onVerify,
  busy = false,
}: {
  challenge: CommunityChallengeDescriptor;
  onCancel: () => void;
  onVerify: (response: string) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const widgetRoot = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [response, setResponse] = useState('');
  const [widgetError, setWidgetError] = useState(false);

  const mountWidget = useCallback(() => {
    if (!widgetRoot.current || !challenge.site_key || widgetId.current) return;
    widgetRoot.current.replaceChildren();
    const options = {
      sitekey: challenge.site_key,
      action: challenge.action.replaceAll('.', '_'),
      callback: (value: string) => setResponse(value),
      'error-callback': () => setWidgetError(true),
      'expired-callback': () => setResponse(''),
    };
    if (challenge.provider === 'turnstile' && window.turnstile) {
      widgetId.current = window.turnstile.render(widgetRoot.current, options);
    } else if (challenge.provider === 'hcaptcha' && window.hcaptcha) {
      widgetId.current = window.hcaptcha.render(widgetRoot.current, options);
    }
  }, [challenge]);

  useEffect(() => {
    setResponse('');
    setWidgetError(false);
    mountWidget();
    return () => {
      if (!widgetId.current) return;
      if (challenge.provider === 'turnstile') window.turnstile?.remove(widgetId.current);
      if (challenge.provider === 'hcaptcha') window.hcaptcha?.remove?.(widgetId.current);
      widgetId.current = null;
    };
  }, [challenge, mountWidget]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && response.trim()) onVerify(response.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation">
      {challenge.provider === 'turnstile' && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={mountWidget} />}
      {challenge.provider === 'hcaptcha' && <Script src="https://js.hcaptcha.com/1/api.js?render=explicit" strategy="afterInteractive" onLoad={mountWidget} />}
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="community-challenge-title" className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl">
        <div>
          <h2 id="community-challenge-title" className="text-lg font-semibold text-[var(--text)]">{t('challenge.title')}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('challenge.description')}</p>
        </div>
        {challenge.provider === 'development' ? (
          <label className="block space-y-2 text-sm text-[var(--text-secondary)]">
            <span>{t('challenge.mathPrompt', { left: challenge.left || 0, right: challenge.right || 0 })}</span>
            <input autoFocus inputMode="numeric" value={response} onChange={(event) => setResponse(event.target.value)} className="min-h-10 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text)]" />
          </label>
        ) : (
          <div>
            <div ref={widgetRoot} className="min-h-16" />
            {widgetError && <p role="alert" className="text-sm text-red-600">{t('challenge.widgetUnavailable')}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded border border-[var(--border)] px-4 text-sm text-[var(--text-secondary)] disabled:opacity-60">{t('challenge.cancel')}</button>
          <button type="submit" disabled={busy || !response.trim()} className="min-h-10 rounded bg-[var(--primary)] px-4 text-sm font-medium text-white disabled:opacity-60">{busy ? t('challenge.verifying') : t('challenge.verify')}</button>
        </div>
      </form>
    </div>
  );
}
