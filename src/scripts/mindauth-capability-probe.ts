/**
 * MindAuth Capability Probe
 *
 * Probes a running MindAuth instance to discover its OAuth/OIDC capabilities.
 * Run this when MindAuth is available to complete the G2 gate.
 *
 * Usage: MINDAUTH_URL=http://localhost:4501 npx ts-node src/scripts/mindauth-capability-probe.ts
 *   or:  npm run probe:mindauth
 */

import axios from 'axios';

const MINDAUTH_URL = process.env.MINDAUTH_URL || 'http://localhost:4501';

/** Mirror the URL builder used by the real integration — all calls go through /api/. */
function joinApi(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}/api${normalizedPath}`;
}

type ProbeResult = {
  endpoint: string;
  available: boolean;
  details?: string;
};

async function probe(name: string, fn: () => Promise<string>): Promise<ProbeResult> {
  try {
    const details = await fn();
    return { endpoint: name, available: true, details };
  } catch (error) {
    const msg = (error as any)?.response?.data
      ? JSON.stringify((error as any).response.data)
      : (error as Error).message;
    return { endpoint: name, available: false, details: msg };
  }
}

async function main() {
  console.log(`\n🔍 Probing MindAuth at ${MINDAUTH_URL}\n`);

  const results: ProbeResult[] = [];

  // 1. Base connectivity (any HTTP response — including 404 — means the host is reachable)
  results.push(await probe('base', async () => {
    try {
      const { status } = await axios.get(MINDAUTH_URL, { timeout: 5000 });
      return `HTTP ${status}`;
    } catch (err: any) {
      if (err?.response?.status) {
        return `HTTP ${err.response.status} (reachable)`;
      }
      throw err;
    }
  }));

  // 2. OIDC Discovery (standard well-known location)
  results.push(await probe('openid-configuration', async () => {
    const { data } = await axios.get(`${MINDAUTH_URL}/.well-known/openid-configuration`, { timeout: 5000 });
    return `Keys: ${Object.keys(data).join(', ')}`;
  }));

  // Fetch discovery once for endpoint lookups
  let discovery: Record<string, any> = {};
  try {
    const { data } = await axios.get(`${MINDAUTH_URL}/.well-known/openid-configuration`, { timeout: 5000 });
    discovery = data;
  } catch {
    // Discovery may not be available — probes below will try the /api/* paths the forum uses
  }

  // 3. Token endpoint (what the forum actually calls: /api/token)
  results.push(await probe('token_endpoint (/api/token)', async () => {
    // Probe by sending an invalid grant — a 400 with an OAuth error body means the endpoint exists
    try {
      await axios.post(joinApi(MINDAUTH_URL, '/token'), {
        grant_type: 'authorization_code',
        code: 'probe_invalid_code',
        client_id: 'probe',
        client_secret: 'probe',
      }, { timeout: 5000 });
      return 'accepted (unexpected)';
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      if (status === 400 || status === 401) {
        return `Exists (HTTP ${status}, error=${body?.error || 'unknown'})`;
      }
      throw err;
    }
  }));

  // 4. Userinfo endpoint (/api/userinfo)
  results.push(await probe('userinfo_endpoint (/api/userinfo)', async () => {
    try {
      await axios.get(joinApi(MINDAUTH_URL, '/userinfo'), {
        headers: { Authorization: 'Bearer probe_invalid_token' },
        timeout: 5000,
      });
      return 'accepted (unexpected)';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 400) {
        return `Exists (HTTP ${status} — rejects bad token)`;
      }
      throw err;
    }
  }));

  // 5. Fallback /user endpoint
  results.push(await probe('fallback_user_endpoint (/api/user)', async () => {
    try {
      await axios.get(joinApi(MINDAUTH_URL, '/user'), {
        headers: { Authorization: 'Bearer probe_invalid_token' },
        timeout: 5000,
      });
      return 'accepted (unexpected)';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 400 || status === 404) {
        return `Exists (HTTP ${status})`;
      }
      throw err;
    }
  }));

  // 6. Revocation endpoint (/api/revoke)
  results.push(await probe('revocation_endpoint (/api/revoke)', async () => {
    try {
      await axios.post(joinApi(MINDAUTH_URL, '/revoke'), {
        access_token: 'probe_invalid',
      }, { timeout: 5000 });
      return 'Accepted (200)';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 400 || status === 401 || status === 404) {
        return `HTTP ${status}`;
      }
      throw err;
    }
  }));

  // 7. Service-to-service validation endpoint
  results.push(await probe('service_validate (/api/service/validate-credentials)', async () => {
    try {
      await axios.post(joinApi(MINDAUTH_URL, '/service/validate-credentials'), {
        username: 'probe',
        password: 'probe',
      }, {
        headers: { 'X-Service-API-Key': 'probe_invalid_key' },
        timeout: 5000,
      });
      return 'Accepted (unexpected)';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 400 || status === 401 || status === 403 || status === 404) {
        return `Exists (HTTP ${status} — rejects bad key/creds)`;
      }
      throw err;
    }
  }));

  // 8. PKCE support (from discovery document)
  results.push(await probe('pkce_support', async () => {
    const methods = discovery.code_challenge_methods_supported;
    return methods ? `Supported: ${methods.join(', ')}` : 'Not advertised in discovery';
  }));

  // 9. Introspection endpoint
  results.push(await probe('introspection_endpoint', async () => {
    const ep = discovery.introspection_endpoint;
    if (ep) return `In discovery: ${ep}`;
    // Try the standard path
    try {
      await axios.post(`${MINDAUTH_URL}/api/introspect`, {
        token: 'probe_invalid',
      }, { timeout: 5000 });
      return 'Exists at /api/introspect';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 400 || status === 401 || status === 404) {
        return `HTTP ${status}`;
      }
      throw err;
    }
  }));

  // 10. Supported grant types
  results.push(await probe('grant_types_supported', async () => {
    const types = discovery.grant_types_supported;
    return types ? types.join(', ') : 'Not advertised in discovery';
  }));

  // 11. Scopes supported
  results.push(await probe('scopes_supported', async () => {
    const scopes = discovery.scopes_supported;
    return scopes ? scopes.join(', ') : 'Not advertised in discovery';
  }));

  // 12. Response types supported
  results.push(await probe('response_types_supported', async () => {
    const types = discovery.response_types_supported;
    return types ? types.join(', ') : 'Not advertised in discovery';
  }));

  // Print results
  console.log('Results:');
  console.log('─'.repeat(70));
  for (const r of results) {
    const status = r.available ? '✅' : '❌';
    console.log(`${status} ${r.endpoint.padEnd(45)} ${r.details}`);
  }
  console.log('─'.repeat(70));

  const available = results.filter(r => r.available).length;
  console.log(`\n📊 ${available}/${results.length} capabilities available\n`);

  // Output as JSON for machine consumption
  const jsonOutput = {
    probed_at: new Date().toISOString(),
    mindauth_url: MINDAUTH_URL,
    results,
  };
  console.log('\n--- JSON output ---');
  console.log(JSON.stringify(jsonOutput, null, 2));
}

main().catch(console.error);
