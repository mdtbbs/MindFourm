'use client';

import { useI18n } from '@/i18n/provider';

const CONTENT_LANGUAGES = ['en', 'ru', 'ja', 'zh-CN', 'es', 'de', 'other'] as const;

export default function ContentLanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor="content-language" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
        {t('contentLanguage.label')}
      </label>
      <select
        id="content-language"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)]"
      >
        <option value="">{t('contentLanguage.unknown')}</option>
        {CONTENT_LANGUAGES.map((language) => (
          <option key={language} value={language}>{t(`contentLanguage.languages.${language}`)}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t('contentLanguage.hint')}</p>
    </div>
  );
}
