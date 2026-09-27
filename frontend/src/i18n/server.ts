import { cookies, headers } from 'next/headers';
import { resolveLocale } from './index';
import { siteProfile } from '@/config/site-profile';

export async function getRequestLocale() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const admin = (requestHeaders.get('x-mindforum-path') || requestHeaders.get('x-matched-path') || requestHeaders.get('next-url') || '').startsWith('/admin');
  return resolveLocale({
    cookie: admin ? cookieStore.get('forum_admin_locale')?.value : cookieStore.get('forum_locale')?.value,
    acceptLanguage: requestHeaders.get('accept-language'),
    supported: admin ? ['en', 'zh-CN'] : siteProfile.localization.supportedLocales,
    fallback: admin ? (siteProfile.profile === 'mdtbbs' ? 'zh-CN' : 'en') : siteProfile.localization.defaultLocale,
  });
}
