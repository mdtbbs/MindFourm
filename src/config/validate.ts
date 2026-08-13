import { Logger } from '@nestjs/common';

/**
 * Startup configuration validation.
 *
 * Every secret in `app.config.ts` falls back to `''` when unset, so a deployment
 * missing `MINDAUTH_CLIENT_SECRET` used to boot happily and then fail at runtime on
 * the first login — and a missing `FORUM_API_KEY` left an endpoint permanently
 * broken with no signal. Failing fast in production turns those into a refusal to
 * start; in development they stay warnings so the app is still runnable.
 *
 * Mirrors `MindAuth/src/config/validate.js`, which this service previously had no
 * equivalent of.
 */

const logger = new Logger('ConfigValidation');

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** Config shape produced by `appConfig()`. */
type AppConfig = ReturnType<typeof import('./app.config').appConfig>;

function looksLocal(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('[::1]');
}

export function collectConfigIssues(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = config.app.env === 'production';

  const requireInProduction = (value: string | undefined, name: string, hint?: string) => {
    if (value) return;
    const message = hint ? `${name} is required in production (${hint})` : `${name} is required in production`;
    if (isProduction) {
      errors.push(message);
    } else {
      warnings.push(`${name} is not set`);
    }
  };

  // --- OAuth: without these, nobody can log in ---
  requireInProduction(config.mindauth.clientSecret, 'MINDAUTH_CLIENT_SECRET');
  if (isProduction && looksLocal(config.mindauth.baseUrl)) {
    errors.push('MINDAUTH_URL must not point to localhost in production');
  }
  if (isProduction && looksLocal(config.mindauth.callbackUrl)) {
    errors.push('MINDAUTH_CALLBACK_URL must not point to localhost in production');
  }

  // --- Public URLs: wrong values silently corrupt emails, sitemaps and redirects ---
  if (isProduction && looksLocal(config.app.frontendUrl)) {
    errors.push('FRONTEND_URL must not point to localhost in production');
  }

  // --- Database ---
  if (isProduction && !config.mysql.password) {
    errors.push('MYSQL_PASSWORD is required in production');
  }
  if (isProduction && config.mysql.user === 'root') {
    warnings.push('MYSQL_USER is "root" — prefer a least-privilege account');
  }
  if (isProduction && !config.redis.password) {
    warnings.push('REDIS_PASSWORD is not set — sessions are stored in an unauthenticated Redis');
  }

  // --- Integrations: only required when actually enabled ---
  const forge = config.forge || { baseUrl: '', apiKey: '' };
  if (forge.baseUrl) {
    requireInProduction(forge.apiKey, 'MDT_FORGE_API_KEY', 'MDT_FORGE_URL is configured');
  }
  if (isProduction && forge.baseUrl && looksLocal(forge.baseUrl)) {
    errors.push('MDT_FORGE_URL must not point to localhost in production');
  }
  // Legacy MFL configuration is no longer used for new uploads, but fail fast
  // if an operator deliberately leaves the old integration enabled for historic
  // resource delivery.
  if (config.mfl?.baseUrl) {
    requireInProduction(config.mfl.apiKey, 'MFL_API_KEY', 'MFL_BASE_URL is configured');
  }
  if (isProduction && !process.env.FORUM_INTERNAL_API_KEY) {
    warnings.push('FORUM_INTERNAL_API_KEY is not set — only loopback frontend-to-backend requests bypass user rate limits');
  }
  if (config.easymanager.enabled) {
    requireInProduction(config.easymanager.apiKey, 'EASYMANAGER_API_KEY', 'EASYMANAGER_ENABLED=true');
  }
  if (!config.automation.apiKey) {
    // Fails closed rather than opening the endpoint, so this is a warning.
    warnings.push('FORUM_API_KEY is not set — /api/service-api/* will reject every request');
  }

  // --- Test authentication must never be reachable in production ---
  if (isProduction && process.env.ENABLE_TEST_AUTH === 'true') {
    warnings.push(
      'ENABLE_TEST_AUTH=true is set but ignored in production; remove it from the environment',
    );
  }

  return { errors, warnings };
}

/**
 * Validate and, in production, refuse to continue on a fatal misconfiguration.
 */
export function validateConfig(config: AppConfig): void {
  const { errors, warnings } = collectConfigIssues(config);

  for (const warning of warnings) {
    logger.warn(warning);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      logger.error(error);
    }
    throw new Error(
      `Invalid configuration (${errors.length} error${errors.length === 1 ? '' : 's'}): ${errors.join('; ')}`,
    );
  }
}
