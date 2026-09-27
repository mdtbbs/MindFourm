'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { localeNames, translate, type Locale } from './index';
import { siteProfile } from '@/config/site-profile';
import { userApi } from '@/lib/api/client';
import { useUserStore } from '@/store/user-store';

type LocaleContextValue = { locale: Locale; t: (key: string, values?: Record<string, string | number>) => string; setLocale: (locale: Locale) => void };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [locale, setCurrentLocale] = useState(initialLocale);
  const pathname = usePathname();
  const user = useUserStore((state) => state.user);
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const isAuthLoading = useUserStore((state) => state.isLoading);
  const setLocale = useCallback((next: Locale) => {
    const isAdmin = window.location.pathname.startsWith('/admin');
    if (!(isAdmin ? ['en', 'zh-CN'] : siteProfile.localization.supportedLocales).includes(next)) return;
    setCurrentLocale(next);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${isAdmin ? 'forum_admin_locale' : 'forum_locale'}=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    document.documentElement.lang = next;
    if (!isAdmin && isAuthenticated) void userApi.updateProfile({ preferred_locale: next }).catch(() => undefined);
  }, [isAuthenticated]);
  useEffect(() => {
    const admin = pathname?.startsWith('/admin') || false;
    const cookieName = admin ? 'forum_admin_locale' : 'forum_locale';
    const saved = document.cookie.split('; ').find((item) => item.startsWith(`${cookieName}=`))?.split('=')[1];
    const preferred = user?.preferred_locale;
    if (admin) {
      const adminLocale = saved === 'zh-CN' ? 'zh-CN' : saved === 'en' ? 'en' : siteProfile.profile === 'mdtbbs' ? 'zh-CN' : 'en';
      if (locale !== adminLocale) setCurrentLocale(adminLocale);
      document.documentElement.lang = adminLocale;
      return;
    }
    const explicit = document.cookie.split('; ').find((item) => item.startsWith('forum_locale_explicit='))?.split('=')[1];
    if (explicit) {
      if (isAuthLoading) return;
      const requested = decodeURIComponent(explicit) as Locale;
      if (siteProfile.localization.supportedLocales.includes(requested)) setLocale(requested);
      document.cookie = 'forum_locale_explicit=; Path=/; Max-Age=0; SameSite=Lax';
      return;
    }
    if (preferred && siteProfile.localization.supportedLocales.includes(preferred as Locale)) {
      const preferredLocale = preferred as Locale;
      if (locale !== preferredLocale) setCurrentLocale(preferredLocale);
      document.documentElement.lang = preferredLocale;
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${cookieName}=${encodeURIComponent(preferredLocale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      return;
    }
    if (saved) return;
  }, [isAuthLoading, locale, pathname, setLocale, user]);
  const value = useMemo(() => ({ locale, t: (key: string, values?: Record<string, string | number>) => translate(locale, key, values), setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export function LocaleSwitcher({ className = '', admin = false }: { className?: string; admin?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
    <span className="sr-only">{t(admin ? 'admin.language' : 'common.language')}</span>
    <select aria-label={t(admin ? 'admin.language' : 'common.language')} value={locale} onChange={(event) => setLocale(event.target.value as Locale)} className="min-h-9 rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 text-[var(--text-secondary)]">
      {(admin ? ['en', 'zh-CN'] : siteProfile.localization.supportedLocales).map((item) => <option key={item} value={item}>{localeNames[item as Locale]}</option>)}
    </select>
  </label>;
}
