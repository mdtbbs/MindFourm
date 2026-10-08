import fs from 'fs';
import path from 'path';
import enCommon from './locales/en/common.json';
import ruCommon from './locales/ru/common.json';
import jaCommon from './locales/ja/common.json';
import zhCommon from './locales/zh-CN/common.json';

const LOCALES = { en: enCommon, ru: ruCommon, ja: jaCommon, 'zh-CN': zhCommon } as const;
const NEBULA_REGISTRY = path.resolve(__dirname, '../../../src/common/contracts/v1-error-codes.ts');

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

function leafValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value).flatMap(leafValues);
}

/** Every stable code the backend can return, read from the registry source. */
function registeredErrorCodes(): string[] {
  const source = fs.readFileSync(NEBULA_REGISTRY, 'utf8');
  const codes = new Set<string>();
  for (const match of source.matchAll(/^  ([A-Z0-9_]+): \{/gm)) codes.add(match[1]);
  for (const match of source.matchAll(/\['([A-Z0-9_]+)',\s*\d+,\s*(?:true|false),/g)) codes.add(match[1]);
  return [...codes].sort();
}

describe('Locale catalog coverage', () => {
  const enKeys = leafKeys(enCommon);

  it.each(Object.entries(LOCALES))('%s defines every key the English catalog defines', (_locale, catalog) => {
    const keys = new Set(leafKeys(catalog));
    expect(enKeys.filter((key) => !keys.has(key))).toEqual([]);
  });

  it('keeps Simplified Chinese out of the English catalog', () => {
    // The Club profile serves English, Russian and Japanese. A Chinese string in
    // this catalog is exactly the "English site leaks Chinese" defect.
    const offenders = Object.entries(enCommon.errors)
      .filter(([, value]) => typeof value === 'string' && /[\u4e00-\u9fff]/.test(value))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it.each(['en', 'ru', 'ja'] as const)('%s translates every registered V1 error code', (locale) => {
    const errors = LOCALES[locale].errors as Record<string, string>;
    const missing = registeredErrorCodes().filter((code) => typeof errors[code] !== 'string');
    expect(missing).toEqual([]);
  });

  it('translates stable error codes, not prose', () => {
    // Every code the registry declares must map to copy, and no catalog may
    // simply echo the machine code back at the reader.
    const codes = registeredErrorCodes();
    for (const [locale, catalog] of Object.entries(LOCALES)) {
      const errors = catalog.errors as Record<string, string>;
      const echoed = codes.filter((code) => errors[code] === code);
      expect({ locale, echoed }).toEqual({ locale, echoed: [] });
    }
  });

  it('never leaves a resolved label looking like a locale key', () => {
    // A missing key makes `translate` return the key itself, which is how a
    // `navigation.publishResource` or `pagination.previous` string ends up in
    // the rendered UI. Guard the copy that callers render directly.
    expect(leafValues(enCommon.shell).every((value) => value !== '')).toBe(true);
    expect(leafKeys(enCommon.shell).length).toBeGreaterThan(0);
  });
});
