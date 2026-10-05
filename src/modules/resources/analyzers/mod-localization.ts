export type LocalizationSummary = {
  locale: string;
  translated: number;
  total: number;
  percentage: number;
  missing_keys: string[];
};

function unescapeProperty(value: string): string {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\([tfnr])/g, (_match, token: string) => ({ t: '\t', f: '\f', n: '\n', r: '\r' } as Record<string, string>)[token]);
}

/** Parses Java `.properties` files without loading or evaluating Mod code. */
export function parseProperties(text: string, maxBytes = 1_000_000): Map<string, string> {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Localization bundle exceeds size limit');
  const logicalLines: string[] = [];
  let pending = '';
  for (const physical of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = pending + physical;
    const slashCount = (line.match(/\\+$/)?.[0].length || 0);
    if (slashCount % 2 === 1) { pending = line.slice(0, -1); continue; }
    logicalLines.push(line);
    pending = '';
  }
  if (pending) logicalLines.push(pending);

  const values = new Map<string, string>();
  for (const line of logicalLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    let split = -1;
    let escaped = false;
    for (let index = 0; index < line.length; index += 1) {
      if (escaped) { escaped = false; continue; }
      if (line[index] === '\\') { escaped = true; continue; }
      if (line[index] === '=' || line[index] === ':' || /\s/.test(line[index])) { split = index; break; }
    }
    const keyRaw = split < 0 ? line : line.slice(0, split);
    let valueStart = split < 0 ? line.length : split;
    while (valueStart < line.length && /\s/.test(line[valueStart])) valueStart += 1;
    if (line[valueStart] === '=' || line[valueStart] === ':') valueStart += 1;
    while (valueStart < line.length && /\s/.test(line[valueStart])) valueStart += 1;
    const key = unescapeProperty(keyRaw.replace(/\\([ :=\\])/g, '$1'));
    if (!key || key.length > 512 || values.size >= 50_000) continue;
    values.set(key, unescapeProperty(line.slice(valueStart).trim()));
  }
  return values;
}

/** Compares every locale bundle against a source bundle and caps key disclosure. */
export function summarizeLocalizations(
  sourceBundle: string,
  localeBundles: Readonly<Record<string, string>>,
  options: { missingKeyLimit?: number } = {},
): LocalizationSummary[] {
  const source = parseProperties(sourceBundle);
  const sourceKeys = [...source.keys()].sort();
  const limit = Math.max(0, Math.min(10_000, Math.trunc(options.missingKeyLimit ?? 2000)));
  return Object.entries(localeBundles).slice(0, 100).map(([locale, bundle]) => {
    if (!/^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8}){0,3}$/.test(locale)) throw new Error(`Invalid locale key: ${locale}`);
    const translated = parseProperties(bundle);
    const missing = sourceKeys.filter((key) => !String(translated.get(key) || '').trim());
    const translatedCount = sourceKeys.length - missing.length;
    return {
      locale,
      translated: translatedCount,
      total: sourceKeys.length,
      percentage: sourceKeys.length ? Math.round((translatedCount / sourceKeys.length) * 1000) / 10 : 100,
      missing_keys: missing.slice(0, limit),
    };
  }).sort((left, right) => left.locale.localeCompare(right.locale));
}
