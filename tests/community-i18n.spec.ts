import { normalizeLocale, resolveLocale, translate, translateApiError, type Locale } from '../frontend/src/i18n';
import englishWorkflows from '../frontend/src/i18n/locales/en/community-workflows.json';
import englishDiscussion from '../frontend/src/i18n/locales/en/discussion.json';
import enCommon from '../frontend/src/i18n/locales/en/common.json';
import ruCommon from '../frontend/src/i18n/locales/ru/common.json';
import jaCommon from '../frontend/src/i18n/locales/ja/common.json';
import zhCommon from '../frontend/src/i18n/locales/zh-CN/common.json';
import ruWorkflows from '../frontend/src/i18n/locales/ru/community-workflows.json';
import jaWorkflows from '../frontend/src/i18n/locales/ja/community-workflows.json';
import zhWorkflows from '../frontend/src/i18n/locales/zh-CN/community-workflows.json';
import ruDiscussion from '../frontend/src/i18n/locales/ru/discussion.json';
import jaDiscussion from '../frontend/src/i18n/locales/ja/discussion.json';
import zhDiscussion from '../frontend/src/i18n/locales/zh-CN/discussion.json';
import englishResources from '../frontend/src/i18n/locales/en/resources.json';
import ruResources from '../frontend/src/i18n/locales/ru/resources.json';
import jaResources from '../frontend/src/i18n/locales/ja/resources.json';
import zhResources from '../frontend/src/i18n/locales/zh-CN/resources.json';
import englishActivity from '../frontend/src/i18n/locales/en/activity.json';
import ruActivity from '../frontend/src/i18n/locales/ru/activity.json';
import jaActivity from '../frontend/src/i18n/locales/ja/activity.json';
import zhActivity from '../frontend/src/i18n/locales/zh-CN/activity.json';
import englishAccount from '../frontend/src/i18n/locales/en/account.json';
import ruAccount from '../frontend/src/i18n/locales/ru/account.json';
import jaAccount from '../frontend/src/i18n/locales/ja/account.json';
import zhAccount from '../frontend/src/i18n/locales/zh-CN/account.json';

const locales: Locale[] = ['en', 'ru', 'ja', 'zh-CN'];
const catalogs: Record<Locale, Record<string, unknown>> = {
  en: { ...enCommon, ...englishWorkflows, ...englishDiscussion, ...englishResources, ...englishActivity, ...englishAccount },
  ru: { ...ruCommon, ...ruWorkflows, ...ruDiscussion, ...ruResources, ...ruActivity, ...ruAccount },
  ja: { ...jaCommon, ...jaWorkflows, ...jaDiscussion, ...jaResources, ...jaActivity, ...jaAccount },
  'zh-CN': { ...zhCommon, ...zhWorkflows, ...zhDiscussion, ...zhResources, ...zhActivity, ...zhAccount },
};

describe('community composition and resource-list translations', () => {
  function messageKeys(value: Record<string, unknown>, prefix = ''): string[] {
    return Object.entries(value).flatMap(([key, child]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === 'object'
        ? messageKeys(child as Record<string, unknown>, fullKey)
        : [fullKey];
    });
  }

  it.each(locales)('provides complete core workflow copy for %s', (locale) => {
    const keys = [...messageKeys(enCommon), ...messageKeys(englishWorkflows), ...messageKeys(englishDiscussion), ...messageKeys(englishResources), ...messageKeys(englishActivity), ...messageKeys(englishAccount)]
      .filter((key) => !key.startsWith('admin'));
    for (const key of keys) {
      const message = key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined, catalogs[locale]);
      expect(typeof message).toBe('string');
      expect(message).not.toBe(key);
    }
  });

  it('interpolates localized labels without changing filter values', () => {
    expect(translate('en', 'resourceList.activeFilters', { count: 3 })).toBe('3 filters active');
    expect(translate('ru', 'postForm.tagsAvailable', { tags: 'strategy, logic' })).toContain('strategy, logic');
    expect(translate('ja', 'draftRecovery.message', { time: '9/27 10:30' })).toContain('9/27 10:30');
  });
});

describe('site locale precedence', () => {
  const clubLocales = ['en', 'ru', 'ja'] as const;

  it('uses an explicit language choice before account and browser preferences', () => {
    expect(resolveLocale({
      explicit: 'ja',
      userPreferred: 'ru',
      cookie: 'en',
      acceptLanguage: 'en-US,en;q=0.9',
      supported: clubLocales,
      fallback: 'en',
    })).toBe('ja');
  });

  it('uses the account preference before a stale locale cookie', () => {
    expect(resolveLocale({
      userPreferred: 'ru',
      cookie: 'en',
      acceptLanguage: 'ja-JP,ja;q=0.9',
      supported: clubLocales,
      fallback: 'en',
    })).toBe('ru');
  });

  it('uses the locale cookie before Accept-Language when no account preference exists', () => {
    expect(resolveLocale({
      cookie: 'ja',
      acceptLanguage: 'ru-RU,ru;q=0.9',
      supported: clubLocales,
      fallback: 'en',
    })).toBe('ja');
  });

  it('normalizes regional tags and falls back when the browser locale is unsupported', () => {
    expect(normalizeLocale('ja-JP', clubLocales)).toBe('ja');
    expect(normalizeLocale('ru_RU', clubLocales)).toBe('ru');
    expect(resolveLocale({ acceptLanguage: 'de-DE,de;q=0.9', supported: clubLocales, fallback: 'en' })).toBe('en');
  });

  it('translates stable verification errors for the active locale', () => {
    expect(translateApiError('EMAIL_VERIFICATION_REQUIRED', 'en')).toContain('email');
    expect(translateApiError('EMAIL_VERIFICATION_REQUIRED', 'ru')).toContain('электронной почты');
    expect(translateApiError('EMAIL_VERIFICATION_REQUIRED', 'ja')).toContain('メールアドレス');
    expect(translateApiError('UNRECOGNIZED_CODE', 'en')).toBeNull();
  });
});
