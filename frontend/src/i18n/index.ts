import en from './locales/en/common.json';
import ru from './locales/ru/common.json';
import ja from './locales/ja/common.json';
import zhCN from './locales/zh-CN/common.json';
import enWorkflows from './locales/en/community-workflows.json';
import ruWorkflows from './locales/ru/community-workflows.json';
import jaWorkflows from './locales/ja/community-workflows.json';
import zhCNWorkflows from './locales/zh-CN/community-workflows.json';
import { siteProfile, type SiteLocale } from '@/config/site-profile';

export type Locale = SiteLocale;
export const localeNames: Record<Locale, string> = { 'zh-CN': '简体中文', en: 'English', ru: 'Русский', ja: '日本語' };
const catalogs = {
  en: { ...en, ...enWorkflows },
  ru: { ...ru, ...ruWorkflows },
  ja: { ...ja, ...jaWorkflows },
  'zh-CN': { ...zhCN, ...zhCNWorkflows },
} as const;

export function normalizeLocale(input?: string | null, supported: readonly string[] = siteProfile.localization.supportedLocales): Locale | null {
  if (!input) return null;
  const normalized = input.trim().replaceAll('_', '-').toLowerCase();
  const language = normalized.split('-')[0];
  const candidate = language === 'zh' ? 'zh-CN' : language;
  return supported.includes(candidate) ? candidate as Locale : null;
}

export function resolveLocale(options: { explicit?: string | null; userPreferred?: string | null; cookie?: string | null; acceptLanguage?: string | null; supported?: readonly string[]; fallback?: string } = {}): Locale {
  const supported = options.supported || siteProfile.localization.supportedLocales;
  for (const candidate of [options.explicit, options.userPreferred, options.cookie]) {
    const locale = normalizeLocale(candidate, supported);
    if (locale) return locale;
  }
  const accepted = (options.acceptLanguage || '').split(',').map((part) => {
    const [tag, quality] = part.trim().split(';q=');
    return { tag, quality: quality === undefined ? 1 : Number(quality) };
  }).filter((item) => Number.isFinite(item.quality)).sort((a, b) => b.quality - a.quality);
  for (const item of accepted) {
    const locale = normalizeLocale(item.tag, supported);
    if (locale) return locale;
  }
  return (normalizeLocale(options.fallback, supported) || siteProfile.localization.defaultLocale) as Locale;
}

export function translate(locale: Locale, key: string, values?: Record<string, string | number>): string {
  const read = (catalog: unknown): unknown => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, catalog);
  const message = read(catalogs[locale]) ?? read(catalogs.en) ?? key;
  if (typeof message !== 'string') return key;
  return Object.entries(values || {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), message);
}

export function getOpenGraphLocale(locale: Locale): string {
  return ({ en: 'en_US', ru: 'ru_RU', ja: 'ja_JP', 'zh-CN': 'zh_CN' } as const)[locale];
}

export function toAdminLocale(locale: Locale): 'en' | 'zh-CN' {
  return locale === 'zh-CN' ? 'zh-CN' : 'en';
}
