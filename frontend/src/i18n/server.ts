import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { resolveLocale } from './index';
import { siteProfile } from '@/config/site-profile';
import { fetchApiData } from '@/lib/api/server-fetch';

const requestLanguageContext = cache(async () => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const admin = (requestHeaders.get('x-mindforum-path') || requestHeaders.get('x-matched-path') || requestHeaders.get('next-url') || '').startsWith('/admin');
  const explicit = admin ? null : cookieStore.get('forum_locale_explicit')?.value;
  const savedLocale = admin ? cookieStore.get('forum_admin_locale')?.value : cookieStore.get('forum_locale')?.value;
  const sessionCookie = admin ? null : cookieStore.get('forum_session');
  const session = explicit || !sessionCookie
    ? null
    : await fetchApiData<{ authenticated?: boolean; user?: { preferred_locale?: string | null; preferred_content_language?: string | null } } | null>('/api/auth/check', {
      fallback: null,
      init: { cache: 'no-store' },
      forwardCookies: true,
    });
  const allowHiddenChinese = siteProfile.profile === 'mindustry-club'
    && (explicit === 'zh-CN' || savedLocale === 'zh-CN' || session?.authenticated && session.user?.preferred_locale === 'zh-CN');
  const locale = resolveLocale({
    explicit,
    userPreferred: session?.authenticated ? session.user?.preferred_locale : null,
    cookie: savedLocale,
    acceptLanguage: requestHeaders.get('accept-language'),
    supported: admin ? ['en', 'zh-CN'] : allowHiddenChinese ? [...siteProfile.localization.supportedLocales, 'zh-CN'] : siteProfile.localization.supportedLocales,
    fallback: admin ? (siteProfile.profile === 'mdtbbs' ? 'zh-CN' : 'en') : siteProfile.localization.defaultLocale,
  });
  const cookiePreference = cookieStore.get('forum_content_language')?.value;
  const rawPreference = (cookiePreference && cookiePreference !== 'auto' ? cookiePreference : null)
    || (session?.authenticated ? session.user?.preferred_content_language : null)
    || locale;
  const contentLanguage = siteProfile.contentLanguages.includes(rawPreference as (typeof siteProfile.contentLanguages)[number])
    ? rawPreference
    : siteProfile.localization.defaultLocale;
  return { locale, contentLanguage };
});

export async function getRequestLocale() { return (await requestLanguageContext()).locale; }

export async function getRequestContentLanguage() { return (await requestLanguageContext()).contentLanguage; }
