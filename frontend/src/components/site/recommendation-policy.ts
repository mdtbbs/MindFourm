export function shouldRecommendMdtbbs(country?: string | null, dismissed = false): boolean {
  return !dismissed && String(country || '').split(',')[0].trim().toUpperCase() === 'CN';
}

export function shouldSubdueMdtbbsRecommendation(explicitLocale?: string | null, acceptLanguage?: string | null): boolean {
  const preferred = String(explicitLocale || '').trim().toLowerCase();
  const accepted = String(acceptLanguage || '').split(',')[0].trim().toLowerCase();
  return ['en', 'ru', 'ja'].some((locale) => preferred.startsWith(locale) || accepted.startsWith(locale));
}
