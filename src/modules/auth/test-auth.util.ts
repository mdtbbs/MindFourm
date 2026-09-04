/**
 * Whether the E2E test-authentication endpoint should exist at all.
 *
 * This is deliberately opt-in. The previous gate was `NODE_ENV !== 'production'`,
 * which fails open: deployments that never set `NODE_ENV` (the PM2 `mindforum-api`
 * app being one) exposed an unauthenticated endpoint that minted an admin session.
 * Requiring an explicit flag inverts that — a missing variable now breaks the test
 * suite loudly instead of opening a backdoor silently.
 *
 * `NODE_ENV=production` refuses regardless of the flag, so a stray
 * `ENABLE_TEST_AUTH=true` in a production environment file cannot re-enable it.
 */
export function isTestAuthEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return process.env.ENABLE_TEST_AUTH === 'true';
}
