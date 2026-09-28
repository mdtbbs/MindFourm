import { cookies, headers } from 'next/headers';
import { resolveLocale } from './index';
import { siteProfile } from '@/config/site-profile';
import { fetchApiData } from '@/lib/api/server-fetch';

export async function getRequestLocale() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const admin = (requestHeaders.get('x-mindforum-path') || requestHeaders.get('x-matched-path') || requestHeaders.get('next-url') || '').startsWith('/admin');
  const explicit = admin ? null : cookieStore.get('forum_locale_explicit')?.value;
  const sessionCookie = admin ? null : cookieStore.get('forum_session');
  const session = explicit || !sessionCookie
    ? null
    : await fetchApiData<{ authenticated?: boolean; user?: { preferred_locale?: string | null } } | null>('/api/auth/check', {
      fallback: null,
      init: { cache: 'no-store' },
      forwardCookies: true,
    });
  return resolveLocale({
    explicit,
    userPreferred: session?.authenticated ? session.user?.preferred_locale : null,
    cookie: admin ? cookieStore.get('forum_admin_locale')?.value : cookieStore.get('forum_locale')?.value,
    acceptLanguage: requestHeaders.get('accept-language'),
    supported: admin ? ['en', 'zh-CN'] : siteProfile.localization.supportedLocales,
    fallback: admin ? (siteProfile.profile === 'mdtbbs' ? 'zh-CN' : 'en') : siteProfile.localization.defaultLocale,
  });
}
