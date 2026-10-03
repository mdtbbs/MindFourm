/**
 * Normalize an editor URL while allowing only HTTP(S), mailto, and same-site relative links.
 * A bare domain is made HTTPS so users do not need to type the scheme.
 */
export function normalizeEditorLink(input: string): string | null {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;

  if (value.startsWith('/') || value.startsWith('#') || value.startsWith('?')) {
    if (value.startsWith('//')) return null;
    try {
      const base = new URL('https://forum.invalid');
      const parsed = new URL(value, base);
      if (parsed.origin !== base.origin) return null;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  }

  if (/^mailto:/i.test(value)) {
    const address = value.slice('mailto:'.length);
    if (!address || /[<>]/.test(address)) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'mailto:' ? parsed.href : null;
    } catch {
      return null;
    }
  }

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}
