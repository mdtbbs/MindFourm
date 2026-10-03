const SECRET_KEY_PATTERN = /(secret|password|token|api[_-]?key|private|credential)/i;
const MAX_VALUE_LENGTH = 4000;
const MAX_AUDITED_KEYS = 100;
const REDACTED = '[redacted]';

export interface SettingsAuditChange {
  before: unknown;
  after: unknown;
}

function auditValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return value == null || value === '' ? '' : REDACTED;
  if (typeof value === 'string' && value.length > MAX_VALUE_LENGTH) {
    return `${value.slice(0, MAX_VALUE_LENGTH)}…[truncated]`;
  }
  return value;
}

/** Build a bounded, secret-safe before/after record for admin setting changes. */
export function createSettingsAuditDetails(
  category: string,
  before: Record<string, unknown>,
  updates: Record<string, unknown>,
  requestId?: string,
): Record<string, unknown> {
  const keys = Object.keys(updates);
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys.slice(0, MAX_AUDITED_KEYS)) {
    changes[key] = {
      before: auditValue(key, before[key]),
      after: auditValue(key, updates[key]),
    };
  }
  return {
    source: 'admin-ui',
    ...(requestId ? { request_id: requestId } : {}),
    category,
    changes,
    ...(keys.length > MAX_AUDITED_KEYS ? { omitted_change_count: keys.length - MAX_AUDITED_KEYS } : {}),
  };
}

/** Returns a rollback only when every field has a safe snapshot and is unchanged since the audit. */
export function getSettingsRollbackValues(
  rawDetails: string | null | undefined,
  category: string,
  current: Record<string, unknown>,
): Record<string, string> | null {
  if (!rawDetails) return null;
  let details: Record<string, unknown>;
  try {
    details = JSON.parse(rawDetails);
  } catch {
    return null;
  }
  if (details.source !== 'admin-ui' || details.category !== category || !details.changes || typeof details.changes !== 'object') return null;
  const changes = details.changes as Record<string, SettingsAuditChange>;
  const entries = Object.entries(changes);
  if (entries.length === 0 || entries.length > MAX_AUDITED_KEYS) return null;
  const rollback: Record<string, string> = {};
  for (const [key, change] of entries) {
    if (SECRET_KEY_PATTERN.test(key) || !change || typeof change.before !== 'string' || typeof change.after !== 'string') return null;
    if (change.before === REDACTED || change.after === REDACTED || current[key] !== change.after) return null;
    rollback[key] = change.before;
  }
  return rollback;
}
