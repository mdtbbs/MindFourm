import enCommon from './locales/en/common.json';
import ruCommon from './locales/ru/common.json';
import jaCommon from './locales/ja/common.json';
import zhCommon from './locales/zh-CN/common.json';
import enDiscovery from './locales/en/discovery.json';
import ruDiscovery from './locales/ru/discovery.json';
import jaDiscovery from './locales/ja/discovery.json';
import zhDiscovery from './locales/zh-CN/discovery.json';

const commonCatalogs = { en: enCommon, ru: ruCommon, ja: jaCommon, 'zh-CN': zhCommon };
const discoveryCatalogs = { en: enDiscovery, ru: ruDiscovery, ja: jaDiscovery, 'zh-CN': zhDiscovery };

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    return current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined;
  }, value);
}

function stringLeafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => stringLeafPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe('Site Profile locale catalogs', () => {
  it.each(Object.entries(commonCatalogs))('%s includes all Club navigation, legal and preference copy', (locale, catalog) => {
    const paths = [
      'navigation',
      'languageSettings',
      'recommendation',
      'legal',
      'adminNavigation.item.resource-analytics',
      'resources.kinds',
    ].flatMap((path) => stringLeafPaths(readPath(enCommon, path), path));

    for (const path of paths) expect(typeof readPath(catalog, path)).toBe('string');
    expect(locale).toBeTruthy();
  });

  it.each(Object.entries(discoveryCatalogs))('%s includes all content-language and search-filter copy', (_locale, catalog) => {
    const paths = [
      'searchPage.filterLanguage',
      'searchPage.allLanguages',
      'contentLanguage.label',
      'contentLanguage.unknown',
      'contentLanguage.hint',
      ...stringLeafPaths(readPath(enDiscovery, 'contentLanguage.languages'), 'contentLanguage.languages'),
    ];
    paths.push(...stringLeafPaths(readPath(enDiscovery, 'discoverPage.discussions'), 'discoverPage.discussions'));
    paths.push(...stringLeafPaths(readPath(enDiscovery, 'discoverPage.discussionsDescription'), 'discoverPage.discussionsDescription'));
    paths.push(...stringLeafPaths(readPath(enDiscovery, 'discoverPage.developers'), 'discoverPage.developers'));
    paths.push(...stringLeafPaths(readPath(enDiscovery, 'discoverPage.developersDescription'), 'discoverPage.developersDescription'));
    for (const path of paths) expect(typeof readPath(catalog, path)).toBe('string');
  });
});
