import { randomBytes, createHash } from 'crypto';

const KEY_PREFIX = 'mfk_live_';
const PREFIX_RANDOM_BYTES = 6;
const SECRET_RANDOM_BYTES = 32;

export interface GeneratedExternalApiKey {
  plainKey: string;
  keyPrefix: string;
  keyHash: string;
}

export function hashExternalApiKey(plainKey: string): string {
  return createHash('sha256').update(plainKey).digest('hex');
}

export function generateExternalApiKey(): GeneratedExternalApiKey {
  const publicPart = randomBytes(PREFIX_RANDOM_BYTES).toString('base64url');
  const secretPart = randomBytes(SECRET_RANDOM_BYTES).toString('base64url');
  const keyPrefix = `${KEY_PREFIX}${publicPart}`;
  const plainKey = `${keyPrefix}.${secretPart}`;

  return {
    plainKey,
    keyPrefix,
    keyHash: hashExternalApiKey(plainKey),
  };
}

export function extractExternalApiKeyPrefix(plainKey: string): string | null {
  const [prefix] = plainKey.split('.');
  if (!prefix || !prefix.startsWith(KEY_PREFIX)) {
    return null;
  }
  return prefix;
}
