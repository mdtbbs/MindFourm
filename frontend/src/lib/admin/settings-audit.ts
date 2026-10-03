export interface SettingsRollbackAudit {
  category: string;
}

const SECRET_KEY_PATTERN = /(secret|password|token|api[_-]?key|private|credential)/i;
const REDACTED = '[redacted]';

/** Returns a category only when a settings audit row contains a safe string snapshot. */
export function getSettingsRollbackAudit(
  action: string,
  rawDetails: string | null | undefined,
): SettingsRollbackAudit | null {
  if (action !== 'settings.update' || !rawDetails) return null;

  let details: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawDetails);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    details = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (details.source !== 'admin-ui' || typeof details.category !== 'string' || !details.category.trim()) return null;
  if (!details.changes || typeof details.changes !== 'object' || Array.isArray(details.changes)) return null;

  const changes = Object.entries(details.changes as Record<string, unknown>);
  if (changes.length === 0 || changes.length > 100) return null;

  for (const [key, rawChange] of changes) {
    if (SECRET_KEY_PATTERN.test(key) || !rawChange || typeof rawChange !== 'object' || Array.isArray(rawChange)) return null;
    const change = rawChange as Record<string, unknown>;
    if (typeof change.before !== 'string' || typeof change.after !== 'string') return null;
    if (change.before === REDACTED || change.after === REDACTED) return null;
  }

  return { category: details.category };
}
