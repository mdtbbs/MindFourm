import { isTestAuthEnabled } from './test-auth.util';

describe('isTestAuthEnabled', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.ENABLE_TEST_AUTH;

  function setEnv(nodeEnv: string | undefined, flag: string | undefined) {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;

    if (flag === undefined) delete process.env.ENABLE_TEST_AUTH;
    else process.env.ENABLE_TEST_AUTH = flag;
  }

  afterEach(() => {
    setEnv(originalNodeEnv, originalFlag);
  });

  it('is disabled when the flag is absent, whatever NODE_ENV says', () => {
    // The regression this guards: PM2 launched the API with no NODE_ENV at all,
    // so a `NODE_ENV !== 'production'` gate left the endpoint live in production.
    setEnv(undefined, undefined);
    expect(isTestAuthEnabled()).toBe(false);

    setEnv('development', undefined);
    expect(isTestAuthEnabled()).toBe(false);

    setEnv('test', undefined);
    expect(isTestAuthEnabled()).toBe(false);
  });

  it('is enabled only when the flag is exactly "true"', () => {
    setEnv('test', 'true');
    expect(isTestAuthEnabled()).toBe(true);

    for (const value of ['1', 'yes', 'TRUE', 'on', '']) {
      setEnv('test', value);
      expect(isTestAuthEnabled()).toBe(false);
    }
  });

  it('refuses in production even when the flag is set', () => {
    setEnv('production', 'true');
    expect(isTestAuthEnabled()).toBe(false);
  });
});
