import { siteProfile, type SiteLocale } from '@/config/site-profile';

export const CONTENT_LANGUAGE_CODES = ['en', 'ru', 'ja', 'zh-CN'] as const satisfies readonly SiteLocale[];
export type ContentLanguage = (typeof CONTENT_LANGUAGE_CODES)[number];

/** Lightweight script detection for initial form values; saved values remain explicit server data. */
export function detectContentLanguage(text: string, fallback: ContentLanguage = siteProfile.localization.defaultLocale): ContentLanguage {
  const sample = text.trim();
  if (!sample) return fallback;
  if (/[\u3040-\u30ff\u31f0-\u31ff]/u.test(sample)) return 'ja';
  if (/[\u0400-\u052f]/u.test(sample)) return 'ru';
  if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(sample)) return 'zh-CN';
  if (/\p{Script=Latin}/u.test(sample)) return fallback === 'ru' || fallback === 'ja' ? fallback : 'en';
  return fallback;
}

/** Keep every language in the feed while bringing matching posts and resources forward. */
export function prioritizeContentLanguage<T extends { content_language?: string | null }>(items: readonly T[], preferred?: string | null): T[] {
  if (!preferred || !siteProfile.contentLanguages.includes(preferred as SiteLocale)) return [...items];
  return items.map((item, index) => ({ item, index }))
    .sort((left, right) => Number(right.item.content_language === preferred) - Number(left.item.content_language === preferred) || left.index - right.index)
    .map(({ item }) => item);
}
