import { timingSafeEqual } from 'crypto';

/**
 * Constant-time secret comparison.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length check
 * has to come first — it leaks only the length, not the contents.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
