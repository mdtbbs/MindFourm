'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';

export function ChinaRecommendationBanner({ subdued }: { subdued: boolean }) {
  const [visible, setVisible] = useState(true);
  const { t } = useI18n();
  if (!visible) return null;
  const dismiss = () => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `club_mdtbbs_recommendation=dismissed; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    setVisible(false);
  };
  return <aside className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 text-sm ${subdued ? 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]' : 'border-blue-200 bg-blue-50 text-slate-800'}`} aria-label={t('recommendation.title')}>
    <div className="min-w-0 flex-1"><strong className="font-semibold">{t('recommendation.title')}</strong><span className="ml-2">{t('recommendation.description')}</span></div>
    <div className="flex shrink-0 items-center gap-3">
      <Link href="https://mdtbbs.cn" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">{t('recommendation.visit')}</Link>
      <button type="button" onClick={dismiss} className="rounded border border-current/20 px-2.5 py-1.5">{t('recommendation.stay')}</button>
    </div>
  </aside>;
}
