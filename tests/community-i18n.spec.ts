import { translate, type Locale } from '../frontend/src/i18n';
import englishWorkflows from '../frontend/src/i18n/locales/en/community-workflows.json';

const locales: Locale[] = ['en', 'ru', 'ja', 'zh-CN'];

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
    for (const key of messageKeys(englishWorkflows)) {
      expect(translate(locale, key)).not.toBe(key);
    }
  });

  it('interpolates localized labels without changing filter values', () => {
    expect(translate('en', 'resourceList.activeFilters', { count: 3 })).toBe('3 filters active');
    expect(translate('ru', 'postForm.tagsAvailable', { tags: 'strategy, logic' })).toContain('strategy, logic');
    expect(translate('ja', 'draftRecovery.message', { time: '9/27 10:30' })).toContain('9/27 10:30');
  });
});
