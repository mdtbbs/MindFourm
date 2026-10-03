const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const committedPublicPath = path.join(root, 'openapi-public-v1.json');
const committedInternalPath = path.join(root, 'openapi-internal-v1.json');
const legacyPublicPath = path.join(root, 'openapi-v1.json');
const generatedPublicPath = path.join(os.tmpdir(), `mindfourm-openapi-public-v1-${process.pid}.json`);
const generatedInternalPath = path.join(os.tmpdir(), `mindfourm-openapi-internal-v1-${process.pid}.json`);

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
    env: {
      ...process.env,
      OPENAPI_PUBLIC_OUTPUT_PATH: generatedPublicPath,
      OPENAPI_INTERNAL_OUTPUT_PATH: generatedInternalPath,
    },
  });
  const allowlist = require(path.join(root, 'dist', 'openapi', 'public-v1-operation-allowlist.js'))
    .PUBLIC_V1_OPERATION_ALLOWLIST;
  const committedPublic = JSON.parse(fs.readFileSync(committedPublicPath, 'utf8'));
  const committedInternal = JSON.parse(fs.readFileSync(committedInternalPath, 'utf8'));
  const legacyPublic = JSON.parse(fs.readFileSync(legacyPublicPath, 'utf8'));
  const generatedPublic = JSON.parse(fs.readFileSync(generatedPublicPath, 'utf8'));
  const generatedInternal = JSON.parse(fs.readFileSync(generatedInternalPath, 'utf8'));
  const publicOperations = [];
  for (const [route, methods] of Object.entries(generatedPublic.paths || {})) {
    for (const [method, operation] of Object.entries(methods || {})) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      publicOperations.push(`${method.toUpperCase()} ${route}`);
      const limit = operation['x-rate-limit'];
      if (!limit || !Number.isInteger(limit.limit) || limit.limit < 1
          || !Number.isInteger(limit.window_seconds) || limit.window_seconds < 1
          || limit.basis !== 'authenticated_user_or_session_or_ip') {
        throw new Error(`Public operation is missing valid x-rate-limit metadata: ${method.toUpperCase()} ${route}`);
      }
      if (operation.deprecated && (!operation['x-deprecated-since']
          || !operation['x-removal-plan'] || !operation['x-migration-guide'])) {
        throw new Error(`Deprecated public operation needs deprecation date, removal plan and migration guide: ${method.toUpperCase()} ${route}`);
      }
    }
  }
  const paths = Object.keys(generatedPublic.paths || {});
  const internalPaths = Object.keys(generatedInternal.paths || {});
  const internalOperations = [];
  for (const [route, methods] of Object.entries(generatedInternal.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (methods?.[method]) internalOperations.push(`${method.toUpperCase()} ${route}`);
    }
  }
  const required = [
    '/v1/capabilities', '/v1/me', '/v1/threads', '/v1/threads/{id}',
    '/v1/threads/{id}/replies', '/v1/resources', '/v1/resources/kinds',
    '/v1/resources/topics', '/v1/resources/drafts/preview', '/v1/resources/drafts',
    '/v1/resources/drafts/{draftId}/submit', '/v1/resources/{id}/manifest',
    '/v1/notifications', '/v1/messages',
    '/v1/packs/{packId}/versions/{versionId}/manifest',
    '/v1/packs/{packId}/versions/{versionId}/download-grants',
    '/v1/resources/{packId}/versions/{versionId}/pack-items',
  ];
  const missing = required.filter((route) => !paths.includes(route));
  const outsideV1 = paths.filter((route) => route !== '/v1' && !route.startsWith('/v1/'));
  const securedWithoutScopes = [];
  for (const [route, operations] of Object.entries(generatedPublic.paths || {})) {
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
  const notWhitelisted = publicOperations.filter((operation) => !allowlist.includes(operation));
  const missingFromPublic = allowlist.filter((operation) => !publicOperations.includes(operation));
  const requiredPackOperations = [
    {
      key: 'GET /v1/packs/{packId}/versions/{versionId}/manifest',
      operationId: 'getPackVersionManifest',
      scopesKey: 'x-oauth-scopes-if-bearer',
      scopes: ['resource.read'],
      limit: 60,
    },
    {
      key: 'POST /v1/packs/{packId}/versions/{versionId}/download-grants',
      operationId: 'createPackVersionDownloadGrants',
      scopesKey: 'x-oauth-scopes-if-bearer',
      scopes: ['resource.download'],
      limit: 10,
    },
    {
      key: 'GET /v1/resources/{packId}/versions/{versionId}/pack-items',
      operationId: 'listPackVersionItems',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 30,
    },
    {
      key: 'PUT /v1/resources/{packId}/versions/{versionId}/pack-items',
      operationId: 'replacePackVersionItems',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 10,
    },
  ];
  const packContractMismatches = [];
  for (const expected of requiredPackOperations) {
    const [method, route] = expected.key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) {
      packContractMismatches.push(`${expected.key} missing`);
      continue;
    }
    const limit = operation['x-rate-limit'];
    if (operation.operationId !== expected.operationId) {
      packContractMismatches.push(`${expected.key} operationId must be ${expected.operationId}`);
    }
    if (JSON.stringify(operation[expected.scopesKey]) !== JSON.stringify(expected.scopes)) {
      packContractMismatches.push(`${expected.key} must declare ${expected.scopesKey}=${expected.scopes.join(',')}`);
    }
    if (limit?.limit !== expected.limit || limit?.window_seconds !== 60) {
      packContractMismatches.push(`${expected.key} must declare a ${expected.limit}/60s rate limit`);
    }
  }
  const internalLeaks = publicOperations.filter((operation) => /(?:^| )\/v1\/(?:admin\/|auth\/mobile\/|lanlink\/)/.test(operation));
  const publicMissingInternally = publicOperations.filter((operation) => !internalOperations.includes(operation));
  if (!paths.length) throw new Error('Public OpenAPI paths must not be empty');
  if (missing.length) throw new Error(`Required V1 routes missing from OpenAPI: ${missing.join(', ')}`);
  if (outsideV1.length) throw new Error(`Non-V1 paths leaked into the public spec: ${outsideV1.join(', ')}`);
  if (notWhitelisted.length) throw new Error(`Unapproved operations leaked into Public OpenAPI: ${notWhitelisted.join(', ')}`);
  if (missingFromPublic.length) throw new Error(`Approved Public operations are missing: ${missingFromPublic.join(', ')}`);
  if (packContractMismatches.length) throw new Error(`Pack Public API contract mismatch: ${packContractMismatches.join('; ')}`);
  if (internalLeaks.length) throw new Error(`Internal routes leaked into Public OpenAPI: ${internalLeaks.join(', ')}`);
  if (publicMissingInternally.length) throw new Error(`Public operations missing from Internal OpenAPI: ${publicMissingInternally.join(', ')}`);
  if (!internalPaths.includes('/v1/admin/notices')) throw new Error('Internal OpenAPI must retain the admin notice contract');
  if (Object.keys(generatedInternal.paths || {}).some((route) => route !== '/v1' && !route.startsWith('/v1/'))) {
    throw new Error('Internal V1 OpenAPI must not contain non-V1 paths');
  }
  if (securedWithoutScopes.length) throw new Error(`OAuth-protected V1 operations need x-required-scopes: ${securedWithoutScopes.join(', ')}`);
  if (JSON.stringify(canonical(committedPublic)) !== JSON.stringify(canonical(generatedPublic))) {
    throw new Error('openapi-public-v1.json has drift; run npm run openapi:export and commit the generated file');
  }
  if (JSON.stringify(canonical(committedInternal)) !== JSON.stringify(canonical(generatedInternal))) {
    throw new Error('openapi-internal-v1.json has drift; run npm run openapi:export and commit the generated file');
  }
  if (JSON.stringify(canonical(legacyPublic)) !== JSON.stringify(canonical(committedPublic))) {
    throw new Error('openapi-v1.json must remain a public-only compatibility mirror of openapi-public-v1.json');
  }
  console.log(`Public OpenAPI current: ${publicOperations.length} operations, ${paths.length} paths, ${Object.keys(generatedPublic.components?.schemas || {}).length} schemas.`);
  console.log(`Internal OpenAPI current: ${internalOperations.length} operations, ${internalPaths.length} paths, ${Object.keys(generatedInternal.components?.schemas || {}).length} schemas.`);
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  fs.rmSync(generatedPublicPath, { force: true });
  fs.rmSync(generatedInternalPath, { force: true });
}
