const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const committedPath = path.join(root, 'openapi-v1.json');
const generatedPath = path.join(os.tmpdir(), `mindfourm-openapi-v1-${process.pid}.json`);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

try {
  execFileSync('npm', ['run', 'build:backend'], { cwd: root, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/export-openapi.js'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, OPENAPI_OUTPUT_PATH: generatedPath },
  });
  const committed = JSON.parse(fs.readFileSync(committedPath, 'utf8'));
  const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
  const paths = Object.keys(generated.paths || {});
  const required = [
    '/v1/capabilities', '/v1/me', '/v1/threads', '/v1/threads/{id}',
    '/v1/threads/{id}/replies', '/v1/resources', '/v1/resources/{id}/manifest',
    '/v1/notifications', '/v1/messages',
  ];
  const missing = required.filter((route) => !paths.includes(route));
  const outsideV1 = paths.filter((route) => route !== '/v1' && !route.startsWith('/v1/'));
  const securedWithoutScopes = [];
  for (const [route, operations] of Object.entries(generated.paths || {})) {
    for (const [method, operation] of Object.entries(operations || {})) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (operation.security?.length) {
        const allowsAnonymous = operation.security.some((requirement) => Object.keys(requirement || {}).length === 0);
        const scopeMetadata = allowsAnonymous
          ? operation['x-oauth-scopes-if-bearer']
          : operation['x-required-scopes'];
        if (!Array.isArray(scopeMetadata) || !scopeMetadata.length) {
          securedWithoutScopes.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
  }
  if (!paths.length) throw new Error('OpenAPI paths must not be empty');
  if (missing.length) throw new Error(`Required V1 routes missing from OpenAPI: ${missing.join(', ')}`);
  if (outsideV1.length) throw new Error(`Non-V1 paths leaked into the public spec: ${outsideV1.join(', ')}`);
  if (securedWithoutScopes.length) throw new Error(`OAuth-protected V1 operations need x-required-scopes: ${securedWithoutScopes.join(', ')}`);
  if (JSON.stringify(canonical(committed)) !== JSON.stringify(canonical(generated))) {
    throw new Error('openapi-v1.json has drift; run npm run openapi:export and commit the generated file');
  }
  console.log(`OpenAPI V1 is current: ${paths.length} paths, ${Object.keys(generated.components?.schemas || {}).length} schemas.`);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  fs.rmSync(generatedPath, { force: true });
}
