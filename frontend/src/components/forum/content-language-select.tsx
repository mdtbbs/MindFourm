'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n/provider';
import { siteProfile } from '@/config/site-profile';
import { CONTENT_LANGUAGE_CODES, detectContentLanguage } from '@/lib/content-language';

export default function ContentLanguageSelect({
  value,
  onChange,
  content = '',
}: {
  value: string;
  onChange: (value: string) => void;
  content?: string;
}) {
  const { t, locale } = useI18n();
  const autoDetectedLanguage = useRef('');
  const manuallySelected = useRef(false);
  useEffect(() => {
    if (manuallySelected.current || !content.trim()) return;
    if (value && !autoDetectedLanguage.current) return;
    if (value && value !== autoDetectedLanguage.current) return;
    const detected = detectContentLanguage(content, siteProfile.contentLanguages.includes(locale) ? locale : siteProfile.localization.defaultLocale);
    autoDetectedLanguage.current = detected;
    if (value !== detected) onChange(detected);
  }, [content, locale, onChange, value]);
  const languages = siteProfile.contentLanguages.length ? siteProfile.contentLanguages : CONTENT_LANGUAGE_CODES;
  return (
    <div>
      <label htmlFor="content-language" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
        {t('contentLanguage.label')}
      </label>
      <select
        id="content-language"
        value={value}
        onChange={(event) => { manuallySelected.current = true; onChange(event.target.value); }}
        className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)]"
      >
        <option value="">{t('contentLanguage.unknown')}</option>
        {languages.map((language) => (
          <option key={language} value={language}>{t(`contentLanguage.languages.${language}`)}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t('contentLanguage.hint')}</p>
    </div>
  );
}
