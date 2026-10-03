function languageOf(value?: string | null): string {
  return String(value || '').split(',')[0].split(';')[0].trim().replaceAll('_', '-').split('-')[0].toLowerCase();
}

export function shouldRecommendMdtbbs(
  country?: string | null,
  dismissed = false,
  explicitLocale?: string | null,
  acceptLanguage?: string | null,
): boolean {
  if (dismissed) return false;
  if (explicitLocale) return languageOf(explicitLocale) === 'zh';
  return String(country || '').split(',')[0].trim().toUpperCase() === 'CN' || languageOf(acceptLanguage) === 'zh';
}
