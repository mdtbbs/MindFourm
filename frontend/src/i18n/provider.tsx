'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Check, Globe2 } from 'lucide-react';
import { localeNames, translate, type Locale } from './index';
import { siteProfile } from '@/config/site-profile';
import { userApi } from '@/lib/api/client';
import { useUserStore } from '@/store/user-store';
import { CONTENT_LANGUAGE_CODES } from '@/lib/content-language';

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
    const validCatalogLocale = CONTENT_LANGUAGE_CODES.includes(next as (typeof CONTENT_LANGUAGE_CODES)[number]);
    if (!(validCatalogLocale && (isAdmin ? ['en', 'zh-CN'] : true))) return;
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
      if (CONTENT_LANGUAGE_CODES.includes(requested as (typeof CONTENT_LANGUAGE_CODES)[number])) setLocale(requested);
      document.cookie = 'forum_locale_explicit=; Path=/; Max-Age=0; SameSite=Lax';
      return;
    }
    const allowHiddenLocale = saved === 'zh-CN' || user?.preferred_locale === 'zh-CN';
    if (preferred && (siteProfile.localization.supportedLocales.includes(preferred as Locale) || (allowHiddenLocale && preferred === 'zh-CN'))) {
      const preferredLocale = preferred as Locale;
      if (locale !== preferredLocale) setCurrentLocale(preferredLocale);
      document.documentElement.lang = preferredLocale;
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${cookieName}=${encodeURIComponent(preferredLocale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      return;
    }
    if (saved && (siteProfile.localization.supportedLocales.includes(decodeURIComponent(saved) as Locale) || saved === 'zh-CN')) return;
  }, [isAuthLoading, locale, pathname, setLocale, user]);
  const value = useMemo(() => ({ locale, t: (key: string, values?: Record<string, string | number>) => translate(locale, key, values), setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export function LocaleSwitcher({
  className = '',
  admin = false,
  placement = 'down',
}: {
  className?: string;
  admin?: boolean;
  placement?: 'up' | 'down';
}) {
  const { locale, setLocale, t } = useI18n();
  const supported = (admin ? ['en', 'zh-CN'] : siteProfile.localization.supportedLocales) as readonly Locale[];
  if (supported.length <= 1) return null;

  const label = t(admin ? 'admin.language' : 'common.language');
  const menuPosition = placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <details className={`group relative ${className}`}>
      <summary
        className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] [&::-webkit-details-marker]:hidden"
        aria-label={label}
        title={label}
      >
        <Globe2 className="h-4 w-4" />
        <span className="hidden xl:inline">{localeNames[locale]}</span>
      </summary>
      <div className={`absolute right-0 z-50 min-w-44 border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-lg ${menuPosition}`}>
        {supported.map((item) => (
          <button
            key={item}
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            onClick={(event) => {
              setLocale(item);
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
          >
            <span>{localeNames[item]}</span>
            {locale === item ? <Check className="h-4 w-4 text-[var(--primary)]" aria-hidden /> : null}
          </button>
        ))}
      </div>
    </details>
  );
}
