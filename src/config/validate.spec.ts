import { collectConfigIssues, validateConfig } from './validate';

type Config = Parameters<typeof collectConfigIssues>[0];

function makeConfig(overrides: Record<string, any> = {}): Config {
  const base = {
    app: {
      port: 4000,
      env: 'production',
      frontendUrl: 'https://forum.example.com',
      apiUrl: 'https://forum.example.com',
    },
    mysql: {
      host: 'db',
      port: 3306,
      user: 'mindforum',
      password: 'secret',
      database: 'mindforum',
    },
    redis: { host: 'redis', port: 6379, password: 'redis-secret', db: 0 },
    mindauth: {
      baseUrl: 'https://auth.example.com',
      clientId: 'forum',
      clientSecret: 'client-secret',
      callbackUrl: 'https://forum.example.com/api/auth/callback',
    },
    easymanager: { enabled: false, baseUrl: '', apiKey: '' },
    mfl: { baseUrl: '', apiKey: '' },
    automation: { apiKey: 'forum-api-key' },
    session: { maxAge: 1 },
    mobileAuth: { issuer: 'https://forum.example.com', audience: 'android', jwtSecret: 'jwt-secret', refreshHmacSecret: 'hmac-secret' },
  };

  // Shallow-merge each namespace so tests can override one field at a time.
  const merged: any = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = { ...(base as any)[key], ...(value as any) };
  }
  return merged as Config;
}

describe('collectConfigIssues', () => {
  const originalTestAuth = process.env.ENABLE_TEST_AUTH;

  afterEach(() => {
    if (originalTestAuth === undefined) delete process.env.ENABLE_TEST_AUTH;
    else process.env.ENABLE_TEST_AUTH = originalTestAuth;
  });

  it('accepts a fully configured production setup', () => {
    const { errors } = collectConfigIssues(makeConfig());
    expect(errors).toEqual([]);
  });

  it('reports missing Mobile Auth secrets when legacy callers omit that namespace', () => {
    const config: any = makeConfig();
    delete config.mobileAuth;
    const { errors } = collectConfigIssues(config);
    expect(errors).toEqual(expect.arrayContaining([
      'MOBILE_AUTH_JWT_SECRET is required in production',
      'MOBILE_AUTH_REFRESH_HMAC_SECRET is required in production',
    ]));
  });

  it('rejects a missing OAuth client secret in production', () => {
    // Previously this defaulted to '' and the app booted, failing only when a user
    // tried to log in.
    const { errors } = collectConfigIssues(makeConfig({ mindauth: { clientSecret: '' } }));
    expect(errors).toContain('MINDAUTH_CLIENT_SECRET is required in production');
  });

  it('only warns about a missing client secret outside production', () => {
    const { errors, warnings } = collectConfigIssues(
      makeConfig({ app: { env: 'development' }, mindauth: { clientSecret: '' } }),
    );
    expect(errors).toEqual([]);
    expect(warnings).toContain('MINDAUTH_CLIENT_SECRET is not set');
  });

  it('rejects localhost URLs in production', () => {
    const { errors } = collectConfigIssues(
      makeConfig({
        app: { frontendUrl: 'http://localhost:3000' },
        mindauth: {
          baseUrl: 'http://127.0.0.1:4001',
          callbackUrl: 'http://localhost:4000/api/auth/callback',
        },
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        'FRONTEND_URL must not point to localhost in production',
        'MINDAUTH_URL must not point to localhost in production',
        'MINDAUTH_CALLBACK_URL must not point to localhost in production',
      ]),
    );
  });

  it('requires a database password in production and flags the root account', () => {
    const { errors, warnings } = collectConfigIssues(
      makeConfig({ mysql: { password: '', user: 'root' } }),
    );

    expect(errors).toContain('MYSQL_PASSWORD is required in production');
    expect(warnings.join(' ')).toContain('least-privilege');
  });

  it('warns about an unauthenticated Redis in production', () => {
    const { warnings } = collectConfigIssues(makeConfig({ redis: { password: undefined } }));
    expect(warnings.join(' ')).toContain('unauthenticated Redis');
  });

  it('requires integration keys only when that integration is configured', () => {
    const withoutMfl = collectConfigIssues(makeConfig({ mfl: { baseUrl: '', apiKey: '' } }));
    expect(withoutMfl.errors).toEqual([]);

    const withMfl = collectConfigIssues(
      makeConfig({ mfl: { baseUrl: 'https://files.example.com', apiKey: '' } }),
    );
    expect(withMfl.errors.join(' ')).toContain('MFL_API_KEY is required in production');

    const withEasyManager = collectConfigIssues(
      makeConfig({ easymanager: { enabled: true, apiKey: '' } }),
    );
    expect(withEasyManager.errors.join(' ')).toContain('EASYMANAGER_API_KEY is required');
  });

  it('warns rather than fails when the service API key is absent', () => {
    // The guard fails closed, so a missing key breaks the endpoint but is not a
    // security hole.
    const { errors, warnings } = collectConfigIssues(makeConfig({ automation: { apiKey: '' } }));
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toContain('FORUM_API_KEY');
  });

  it('warns when test auth is enabled in a production environment', () => {
    process.env.ENABLE_TEST_AUTH = 'true';
    const { warnings } = collectConfigIssues(makeConfig());
    expect(warnings.join(' ')).toContain('ENABLE_TEST_AUTH');
  });
});

describe('validateConfig', () => {
  it('throws when production configuration is fatally incomplete', () => {
    expect(() => validateConfig(makeConfig({ mindauth: { clientSecret: '' } }))).toThrow(
      /Invalid configuration/,
    );
  });

  it('returns normally for a valid configuration', () => {
    expect(() => validateConfig(makeConfig())).not.toThrow();
  });

  it('does not throw in development even when secrets are missing', () => {
    expect(() =>
      validateConfig(
        makeConfig({
          app: { env: 'development', frontendUrl: 'http://localhost:3000' },
          mysql: { password: '' },
          mindauth: { clientSecret: '', baseUrl: 'http://localhost:4001' },
        }),
      ),
    ).not.toThrow();
  });
});
