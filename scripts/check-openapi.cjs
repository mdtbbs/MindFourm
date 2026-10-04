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
    '/v1/resources/maps/{id}/versions/{versionId}/feedback',
    '/v1/resources/mods/{id}/dependency-resolution',
    '/v1/resources/mods/{id}/issue-reports',
    '/v1/resources/{id}/review-events',
    '/v1/resources/{id}/versions/{versionId}/analysis/overrides',
    '/v1/resources/{id}/review-annotations',
    '/v1/resources/{id}/source-sync/github',
    '/v1/resources/{id}/source-sync/github/releases',
    '/v1/resources/{id}/source-sync/github/import',
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
  const requiredResourceV2Operations = [
    ['GET /v1/resources/{id}/versions', 'listResourceVersionsV2'],
    ['GET /v1/resources/{id}/relations', 'listResourceRelationsV2'],
    ['GET /v1/resources/{id}/stats', 'getResourceStatsV2'],
    ['GET /v1/resources/{id}/workbench', 'getResourceWorkbenchV2'],
    ['GET /v1/resources/mods/{id}', 'getModResourceV2'],
    ['GET /v1/resources/mods/{id}/versions', 'listModResourceVersionsV2'],
    ['GET /v1/resources/mods/{id}/manifest', 'getModResourceManifestV2'],
    ['GET /v1/resources/mods/{id}/resolve', 'resolveModIdV2'],
    ['GET /v1/resources/mods/{id}/contents', 'listModContentsV2'],
    ['GET /v1/resources/mods/{id}/localizations', 'listModLocalizationsV2'],
    ['GET /v1/resources/mods/{id}/dependencies', 'listModDependenciesV2'],
    ['GET /v1/resources/mods/{id}/issue-reports', 'listModIssueReportsV2'],
    ['GET /v1/resources/mods/{id}/compatibility', 'getModCompatibilityV2'],
    ['GET /v1/resources/mods/{id}/conflicts', 'listModConflictsV2'],
    ['GET /v1/resources/mods/{id}/relations', 'listModRelationsV2'],
    ['GET /v1/resources/mods/{id}/analysis', 'getModAnalysisV2'],
    ['GET /v1/resources/mods/{id}/diff', 'getModVersionDiffV2'],
    ['GET /v1/resources/schematics/{id}', 'getSchematicResourceV2'],
    ['GET /v1/resources/schematics/{id}/versions', 'listSchematicVersionsV2'],
    ['GET /v1/resources/schematics/{id}/manifest', 'getSchematicManifestV2'],
    ['GET /v1/resources/schematics/{id}/analysis', 'getSchematicAnalysisV2'],
    ['GET /v1/resources/schematics/{id}/blocks', 'listSchematicBlocksV2'],
    ['GET /v1/resources/schematics/{id}/materials', 'listSchematicMaterialsV2'],
    ['GET /v1/resources/schematics/{id}/production', 'getSchematicProductionV2'],
    ['GET /v1/resources/schematics/{id}/logic', 'listSchematicLogicV2'],
    ['GET /v1/resources/schematics/{id}/dependencies', 'listSchematicDependenciesV2'],
    ['GET /v1/resources/schematics/{id}/relations', 'listSchematicRelationsV2'],
    ['GET /v1/resources/schematics/{id}/diff', 'getSchematicVersionDiffV2'],
    ['GET /v1/resources/maps/{id}', 'getMapResourceV2'],
    ['GET /v1/resources/maps/{id}/versions', 'listMapVersionsV2'],
    ['GET /v1/resources/maps/{id}/manifest', 'getMapManifestV2'],
    ['GET /v1/resources/maps/{id}/analysis', 'getMapAnalysisV2'],
    ['GET /v1/resources/maps/{id}/rules', 'getMapRulesV2'],
    ['GET /v1/resources/maps/{id}/resources', 'listMapResourcesV2'],
    ['GET /v1/resources/maps/{id}/waves', 'listMapWavesV2'],
    ['GET /v1/resources/maps/{id}/spawns', 'listMapSpawnsV2'],
    ['GET /v1/resources/maps/{id}/dependencies', 'listMapDependenciesV2'],
    ['GET /v1/resources/maps/{id}/relations', 'listMapRelationsV2'],
    ['GET /v1/resources/maps/{id}/diff', 'getMapVersionDiffV2'],
    ['GET /v1/game-content/content/search', 'searchGameContentIndexV2'],
    ['GET /v1/game-content/content/by-name/{type}/{internalName}', 'findGameContentByNameV2'],
    ['GET /v1/game-content/content/{id}', 'getGameContentItemV2'],
  ];
  const requiredResourceV2RawOperations = [
    ['GET /v1/resources/{id}/versions/{versionId}/preview', 'getResourceVersionPreviewV2'],
  ];
  const commonResourceCompatibilityOperations = [
    ['GET /v1/resources/{id}', 'ResourcesV1Controller_getResource'],
    ['GET /v1/resources/{id}/manifest', 'ResourcesV1Controller_getManifest'],
  ];
  const requiredResourceV2WriteOperations = [
    'POST /v1/resources/{id}/versions/analyze',
    'POST /v1/resources/{id}/versions',
    'PATCH /v1/resources/{id}',
    'POST /v1/resources/{id}/relations',
    'POST /v1/resources/{id}/members',
    'POST /v1/resources/{id}/members/respond',
    'POST /v1/resources/{id}/owner-transfer',
  ];
  const requiredResourceV2CommunityOperations = [
    {
      key: 'GET /v1/resources/maps/{id}/versions/{versionId}/feedback',
      operationId: 'getMapFeedbackAggregateV2',
      scopesKey: 'x-oauth-scopes-if-bearer',
      scopes: ['resource.read'],
      limit: 60,
      successStatus: '200',
    },
    {
      key: 'POST /v1/resources/maps/{id}/versions/{versionId}/feedback',
      operationId: 'upsertMapFeedbackV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 10,
      successStatus: '200',
    },
    {
      key: 'POST /v1/resources/mods/{id}/versions/{versionId}/compatibility-reports',
      operationId: 'submitModCompatibilityReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 10,
      successStatus: '201',
    },
    {
      key: 'PUT /v1/resources/mods/compatibility-reports/{reportId}',
      operationId: 'updateModCompatibilityReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 20,
      successStatus: '200',
    },
    {
      key: 'POST /v1/resources/mods/{id}/versions/{versionId}/issue-reports',
      operationId: 'submitModIssueReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 10,
      successStatus: '201',
    },
    {
      key: 'PUT /v1/resources/mods/issue-reports/{reportId}',
      operationId: 'updateModIssueReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 20,
      successStatus: '200',
    },
    {
      key: 'POST /v1/resources/mods/compatibility-reports/{reportId}/author-response',
      operationId: 'respondToModCompatibilityReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 20,
      successStatus: '200',
    },
    {
      key: 'POST /v1/resources/mods/issue-reports/{reportId}/author-response',
      operationId: 'respondToModIssueReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 20,
      successStatus: '200',
    },
    {
      key: 'POST /v1/resources/mods/conflicts',
      operationId: 'submitModConflictReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 10,
      successStatus: '201',
    },
    {
      key: 'POST /v1/resources/mods/conflicts/{reportId}/author-response',
      operationId: 'respondToModConflictReportV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 20,
      successStatus: '200',
    },
  ];
  const requiredResourceV2ReviewOperations = [
    {
      key: 'GET /v1/resources/{id}/review-events',
      operationId: 'listResourceReviewEventsV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.read'],
      limit: 60,
      successStatus: '200',
      dataSchema: 'ResourceV2ReviewTimelineResponseDto',
      pathParameters: ['id'],
    },
    {
      key: 'POST /v1/resources/{id}/versions/{versionId}/analysis/overrides',
      operationId: 'ignoreResourceAnalysisFindingV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 20,
      successStatus: '200',
      dataSchema: 'ResourceV2FindingOverrideResponseDto',
      bodySchema: 'ResourceV2FindingOverrideDto',
      pathParameters: ['id', 'versionId'],
    },
    {
      key: 'DELETE /v1/resources/{id}/versions/{versionId}/analysis/overrides',
      operationId: 'clearResourceAnalysisFindingV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 20,
      successStatus: '200',
      dataSchema: 'ResourceV2FindingOverrideResponseDto',
      bodySchema: 'ResourceV2ClearFindingOverrideDto',
      pathParameters: ['id', 'versionId'],
    },
    {
      key: 'POST /v1/resources/{id}/review-annotations',
      operationId: 'createResourceReviewAnnotationV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 30,
      successStatus: '201',
      dataSchema: 'ResourceV2ReviewAnnotationResponseDto',
      bodySchema: 'ResourceV2ReviewAnnotationDto',
      pathParameters: ['id'],
    },
  ];
  const requiredResourceV2SourceSyncOperations = [
    {
      key: 'PUT /v1/resources/{id}/source-sync/github',
      operationId: 'upsertResourceGithubSourceSyncV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 10,
      successStatus: '200',
      bodySchema: 'ResourceSourceSyncConfigDto',
      errorStatuses: ['400', '401', '403', '404'],
      pathParameters: ['id'],
    },
    {
      key: 'GET /v1/resources/{id}/source-sync/github/releases',
      operationId: 'listResourceGithubReleasesV2',
      scopesKey: 'x-oauth-scopes-if-bearer',
      scopes: ['resource.read'],
      limit: 12,
      successStatus: '200',
      errorStatuses: ['400', '401', '404', '502'],
      pathParameters: ['id'],
      query: { name: 'limit', minimum: 1, maximum: 30 },
    },
    {
      key: 'POST /v1/resources/{id}/source-sync/github/import',
      operationId: 'importResourceGithubReleaseV2',
      scopesKey: 'x-required-scopes',
      scopes: ['resource.upload'],
      limit: 5,
      successStatus: '201',
      bodySchema: 'ResourceSourceSyncImportDto',
      errorStatuses: ['400', '401', '403', '404', '502'],
      pathParameters: ['id'],
    },
  ];
  const resourceV2Mismatches = [];
  for (const [key, operationId] of requiredResourceV2Operations) {
    const [method, route] = key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) {
      resourceV2Mismatches.push(`${key} missing`);
      continue;
    }
    if (operation.operationId !== operationId) resourceV2Mismatches.push(`${key} operationId must be ${operationId}`);
    if (JSON.stringify(operation['x-oauth-scopes-if-bearer']) !== JSON.stringify(['resource.read'])) {
      resourceV2Mismatches.push(`${key} must declare optional Bearer scope resource.read`);
    }
    const rateLimit = operation['x-rate-limit'];
    if (rateLimit?.limit !== 60 || rateLimit?.window_seconds !== 60) resourceV2Mismatches.push(`${key} must declare a 60/60s rate limit`);
    const success = operation.responses?.['200']?.content?.['application/json'];
    if (!success?.schema || !success?.schema?.example?.meta?.request_id) {
      resourceV2Mismatches.push(`${key} must document the V1 envelope schema and a success example`);
    }
    if (!operation.responses?.['400']?.content?.['application/json'] || !operation.responses?.['404']?.content?.['application/json']) {
      resourceV2Mismatches.push(`${key} must document standard V1 bad-request and not-found errors`);
    }
  }
  for (const [key, operationId] of requiredResourceV2RawOperations) {
    const [method, route] = key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) {
      resourceV2Mismatches.push(`${key} missing`);
      continue;
    }
    if (operation.operationId !== operationId) resourceV2Mismatches.push(`${key} operationId must be ${operationId}`);
    if (JSON.stringify(operation['x-oauth-scopes-if-bearer']) !== JSON.stringify(['resource.read'])) {
      resourceV2Mismatches.push(`${key} must declare optional Bearer scope resource.read`);
    }
    const rateLimit = operation['x-rate-limit'];
    if (rateLimit?.limit !== 30 || rateLimit?.window_seconds !== 60) resourceV2Mismatches.push(`${key} must declare a 30/60s rate limit`);
    if (!operation.responses?.['200']?.content?.['image/png']?.schema
        || operation.responses['200'].content['image/png'].schema.format !== 'binary') {
      resourceV2Mismatches.push(`${key} must document raw image/png bytes, not the JSON V1 envelope`);
    }
  }
  for (const [key, operationId] of commonResourceCompatibilityOperations) {
    const [method, route] = key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) resourceV2Mismatches.push(`${key} existing V1 compatibility operation missing`);
    else if (operation.operationId !== operationId) {
      resourceV2Mismatches.push(`${key} must remain the existing V1 compatibility operation (${operationId})`);
    }
  }
  const relationContextEnum = generatedPublic.components?.schemas?.ResourceV2RelationDto?.properties?.relation_context?.enum;
  if (JSON.stringify(relationContextEnum) !== JSON.stringify(['opening', 'production', 'defense', 'logistics', 'general'])) {
    resourceV2Mismatches.push('ResourceV2RelationDto.relation_context must publish the five supported contexts');
  }
  for (const key of requiredResourceV2WriteOperations) {
    const [method, route] = key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) {
      resourceV2Mismatches.push(`${key} missing`);
      continue;
    }
    if (JSON.stringify(operation['x-required-scopes']) !== JSON.stringify(['resource.upload'])) {
      resourceV2Mismatches.push(`${key} must require resource.upload scope`);
    }
  }
  for (const expected of requiredResourceV2CommunityOperations) {
    const [method, route] = expected.key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) {
      resourceV2Mismatches.push(`${expected.key} missing`);
      continue;
    }
    if (operation.operationId !== expected.operationId) {
      resourceV2Mismatches.push(`${expected.key} operationId must be ${expected.operationId}`);
    }
    if (JSON.stringify(operation[expected.scopesKey]) !== JSON.stringify(expected.scopes)) {
      resourceV2Mismatches.push(`${expected.key} must declare ${expected.scopesKey}=${expected.scopes.join(',')}`);
    }
    const rateLimit = operation['x-rate-limit'];
    if (rateLimit?.limit !== expected.limit || rateLimit?.window_seconds !== 60) {
      resourceV2Mismatches.push(`${expected.key} must declare a ${expected.limit}/60s rate limit`);
    }
    if (!operation.responses?.[expected.successStatus]) {
      resourceV2Mismatches.push(`${expected.key} must document its HTTP ${expected.successStatus} success response`);
    }
    if (expected.operationId === 'submitModIssueReportV2'
        && !/upsert/i.test(operation.description || '')
        || expected.operationId === 'submitModIssueReportV2'
        && !/UUID|状态/.test(operation.description || '')) {
      resourceV2Mismatches.push(`${expected.key} must document idempotent upsert semantics and preservation of the report UUID/status`);
    }
  }
  for (const expected of requiredResourceV2ReviewOperations) {
    const [method, route] = expected.key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) {
      resourceV2Mismatches.push(`${expected.key} missing`);
      continue;
    }
    if (operation.operationId !== expected.operationId) {
      resourceV2Mismatches.push(`${expected.key} operationId must be ${expected.operationId}`);
    }
    if (JSON.stringify(operation[expected.scopesKey]) !== JSON.stringify(expected.scopes)) {
      resourceV2Mismatches.push(`${expected.key} must declare ${expected.scopesKey}=${expected.scopes.join(',')}`);
    }
    const rateLimit = operation['x-rate-limit'];
    if (rateLimit?.limit !== expected.limit || rateLimit?.window_seconds !== 60) {
      resourceV2Mismatches.push(`${expected.key} must declare a ${expected.limit}/60s rate limit`);
    }
    const successResponse = operation.responses?.[expected.successStatus]?.content?.['application/json'];
    const successSchema = successResponse?.schema;
    if (successSchema?.allOf?.[0]?.properties?.data?.$ref !== `#/components/schemas/${expected.dataSchema}`
        || !successSchema?.example?.meta?.request_id) {
      resourceV2Mismatches.push(`${expected.key} must document ${expected.dataSchema} in the V1 envelope with an example`);
    }
    for (const status of ['400', '401', '403', '404']) {
      const error = operation.responses?.[status]?.content?.['application/json'];
      const errorSchema = error?.schema;
      if (errorSchema?.$ref !== '#/components/schemas/ResourceV2ApiErrorEnvelopeDto'
          || !error?.example?.error?.code || !error?.example?.meta?.request_id) {
        resourceV2Mismatches.push(`${expected.key} must document typed V1 ${status} error with an example`);
      }
    }
    const parameters = operation.parameters || [];
    for (const name of expected.pathParameters) {
      const parameter = parameters.find((candidate) => candidate.in === 'path' && candidate.name === name);
      if (!parameter || parameter.schema?.format !== 'uuid') {
        resourceV2Mismatches.push(`${expected.key} must expose path parameter ${name} as public UUID`);
      }
    }
    if (expected.key === 'GET /v1/resources/{id}/review-events') {
      const version = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'version_public_id');
      const limit = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'limit');
      const offset = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'offset');
      if (!version || version.required || version.schema?.format !== 'uuid') {
        resourceV2Mismatches.push(`${expected.key} must expose optional UUID version_public_id`);
      }
      if (!limit || limit.required || limit.schema?.minimum !== 1 || limit.schema?.maximum !== 100) {
        resourceV2Mismatches.push(`${expected.key} must bound optional limit to 1..100`);
      }
      if (!offset || offset.required || offset.schema?.minimum !== 0 || offset.schema?.maximum !== 100_000) {
        resourceV2Mismatches.push(`${expected.key} must bound optional offset to 0..100000`);
      }
    }
    if (expected.bodySchema) {
      const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
      if (bodySchema?.$ref !== `#/components/schemas/${expected.bodySchema}`) {
        resourceV2Mismatches.push(`${expected.key} must document ${expected.bodySchema} request schema`);
      }
    }
  }
  for (const expected of requiredResourceV2SourceSyncOperations) {
    const [method, route] = expected.key.split(' ');
    const operation = generatedPublic.paths?.[route]?.[method.toLowerCase()];
    if (!operation) {
      resourceV2Mismatches.push(`${expected.key} missing`);
      continue;
    }
    if (operation.operationId !== expected.operationId) {
      resourceV2Mismatches.push(`${expected.key} operationId must be ${expected.operationId}`);
    }
    if (JSON.stringify(operation[expected.scopesKey]) !== JSON.stringify(expected.scopes)) {
      resourceV2Mismatches.push(`${expected.key} must declare ${expected.scopesKey}=${expected.scopes.join(',')}`);
    }
    const rateLimit = operation['x-rate-limit'];
    if (rateLimit?.limit !== expected.limit || rateLimit?.window_seconds !== 60) {
      resourceV2Mismatches.push(`${expected.key} must declare a ${expected.limit}/60s rate limit`);
    }
    if (!operation.responses?.[expected.successStatus]?.description) {
      resourceV2Mismatches.push(`${expected.key} must document HTTP ${expected.successStatus} success`);
    }
    for (const status of expected.errorStatuses) {
      if (!operation.responses?.[status]?.description) {
        resourceV2Mismatches.push(`${expected.key} must document HTTP ${status} error`);
      }
    }
    if (!/manual|手动/i.test(`${operation.summary || ''} ${operation.description || ''}`)
        || /自动同步|scheduled polling|定时任务/i.test(operation.description || '')) {
      resourceV2Mismatches.push(`${expected.key} must clearly document manual-only GitHub sync behavior`);
    }
    const parameters = operation.parameters || [];
    for (const name of expected.pathParameters) {
      const parameter = parameters.find((candidate) => candidate.in === 'path' && candidate.name === name);
      if (!parameter || parameter.schema?.format !== 'uuid') {
        resourceV2Mismatches.push(`${expected.key} must expose path parameter ${name} as public UUID`);
      }
    }
    if (expected.query) {
      const query = parameters.find((parameter) => parameter.in === 'query' && parameter.name === expected.query.name);
      if (!query || query.required || query.schema?.minimum !== expected.query.minimum || query.schema?.maximum !== expected.query.maximum) {
        resourceV2Mismatches.push(`${expected.key} must bound optional ${expected.query.name} to ${expected.query.minimum}..${expected.query.maximum}`);
      }
    }
    if (expected.bodySchema) {
      const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
      if (bodySchema?.$ref !== `#/components/schemas/${expected.bodySchema}`) {
        resourceV2Mismatches.push(`${expected.key} must document ${expected.bodySchema} request schema`);
      }
    }
  }
  const reviewDtoSchemas = generatedPublic.components?.schemas || {};
  for (const [schemaName, expectedFields] of [
    ['ResourceV2ReviewTimelineEventDto', ['resource_public_id', 'version_public_id', 'event_type', 'actor', 'timestamp', 'parser_version']],
    ['ResourceV2FindingOverrideResponseDto', ['resource_public_id', 'version_public_id', 'finding_key', 'severity', 'ignored', 'reason']],
    ['ResourceV2ReviewAnnotationResponseDto', ['resource_public_id', 'version_public_id', 'field_path', 'severity', 'body']],
  ]) {
    const properties = reviewDtoSchemas[schemaName]?.properties || {};
    for (const field of expectedFields) {
      if (!properties[field]) resourceV2Mismatches.push(`${schemaName} must expose ${field}`);
    }
    for (const privateField of ['id', 'resource_id', 'resource_version_id', 'actor_user_id', 'created_by_user_id']) {
      if (properties[privateField]) resourceV2Mismatches.push(`${schemaName} must not expose internal field ${privateField}`);
    }
  }
  const dependencyResolutionKey = 'GET /v1/resources/mods/{id}/dependency-resolution';
  const dependencyResolutionOperation = generatedPublic.paths?.['/v1/resources/mods/{id}/dependency-resolution']?.get;
  if (!dependencyResolutionOperation) {
    resourceV2Mismatches.push(`${dependencyResolutionKey} missing`);
  } else {
    if (dependencyResolutionOperation.operationId !== 'resolveModDependencyTreeV2') {
      resourceV2Mismatches.push(`${dependencyResolutionKey} operationId must be resolveModDependencyTreeV2`);
    }
    if (JSON.stringify(dependencyResolutionOperation['x-oauth-scopes-if-bearer']) !== JSON.stringify(['resource.read'])) {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must declare optional Bearer scope resource.read`);
    }
    const rateLimit = dependencyResolutionOperation['x-rate-limit'];
    if (rateLimit?.limit !== 30 || rateLimit?.window_seconds !== 60) {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must declare a 30/60s rate limit`);
    }
    const parameters = dependencyResolutionOperation.parameters || [];
    const resourceIdParameter = parameters.find((parameter) => parameter.in === 'path' && parameter.name === 'id');
    const versionParameter = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'version_public_id');
    const depthParameter = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'max_depth');
    const nodesParameter = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'max_nodes');
    if (!resourceIdParameter || resourceIdParameter.schema?.format !== 'uuid') {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must expose Resource public UUID path id`);
    }
    if (!versionParameter || versionParameter.required || versionParameter.schema?.format !== 'uuid') {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must expose optional UUID query version_public_id`);
    }
    if (!depthParameter || depthParameter.required || depthParameter.schema?.minimum !== 1 || depthParameter.schema?.maximum !== 12) {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must bound optional max_depth to 1..12`);
    }
    if (!nodesParameter || nodesParameter.required || nodesParameter.schema?.minimum !== 1 || nodesParameter.schema?.maximum !== 200) {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must bound optional max_nodes to 1..200`);
    }
    const successSchema = dependencyResolutionOperation.responses?.['200']?.content?.['application/json']?.schema;
    const successDataRef = successSchema?.allOf?.[0]?.properties?.data?.$ref;
    if (successDataRef !== '#/components/schemas/ResourceV2DependencyResolutionDto') {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must document ResourceV2DependencyResolutionDto in the V1 envelope`);
    }
    if (!successSchema?.example?.meta?.request_id
        || !dependencyResolutionOperation.responses?.['400']?.content?.['application/json']
        || !dependencyResolutionOperation.responses?.['404']?.content?.['application/json']) {
      resourceV2Mismatches.push(`${dependencyResolutionKey} must document a V1 success example and standard 400/404 errors`);
    }
  }
  const dependencyResolutionSchema = generatedPublic.components?.schemas?.ResourceV2DependencyResolutionDto?.properties || {};
  for (const field of ['direct', 'tree', 'unresolved', 'cycles', 'warnings', 'truncated']) {
    if (!dependencyResolutionSchema[field]) resourceV2Mismatches.push(`ResourceV2DependencyResolutionDto must expose ${field}`);
  }
  const resolvedDependencyStatuses = generatedPublic.components?.schemas?.ResourceV2ResolvedDependencyDto?.properties?.status?.enum || [];
  for (const status of ['unresolved', 'cycle', 'limit_reached']) {
    if (!resolvedDependencyStatuses.includes(status)) {
      resourceV2Mismatches.push(`ResourceV2ResolvedDependencyDto.status must include ${status}`);
    }
  }
  const issueReportsKey = 'GET /v1/resources/mods/{id}/issue-reports';
  const issueReportsOperation = generatedPublic.paths?.['/v1/resources/mods/{id}/issue-reports']?.get;
  if (!issueReportsOperation) {
    resourceV2Mismatches.push(`${issueReportsKey} missing`);
  } else {
    const parameters = issueReportsOperation.parameters || [];
    const versionParameter = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'version_public_id');
    const cursorParameter = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'cursor');
    const limitParameter = parameters.find((parameter) => parameter.in === 'query' && parameter.name === 'limit');
    if (!versionParameter || versionParameter.required || versionParameter.schema?.format !== 'uuid') {
      resourceV2Mismatches.push(`${issueReportsKey} must expose optional UUID query version_public_id`);
    }
    if (!cursorParameter || cursorParameter.required || cursorParameter.schema?.maxLength !== 1024) {
      resourceV2Mismatches.push(`${issueReportsKey} must expose optional opaque cursor query`);
    }
    if (!limitParameter || limitParameter.required || limitParameter.schema?.minimum !== 1 || limitParameter.schema?.maximum !== 100) {
      resourceV2Mismatches.push(`${issueReportsKey} must expose optional limit bounded to 1..100`);
    }
    const successSchema = issueReportsOperation.responses?.['200']?.content?.['application/json']?.schema;
    const successDataRef = successSchema?.allOf?.[0]?.properties?.data?.$ref;
    if (successDataRef !== '#/components/schemas/ResourceV2IssueReportPageDto') {
      resourceV2Mismatches.push(`${issueReportsKey} must document ResourceV2IssueReportPageDto in the V1 envelope`);
    }
  }
  const issueReportProperties = generatedPublic.components?.schemas?.ResourceV2IssueReportDto?.properties || {};
  for (const field of ['public_id', 'version_public_id', 'status', 'title', 'body', 'author_response_status', 'author_response', 'fixed_version_public_id', 'created_at']) {
    if (!issueReportProperties[field]) resourceV2Mismatches.push(`ResourceV2IssueReportDto must expose ${field}`);
  }
  for (const privateField of ['attachments', 'attachment_json']) {
    if (issueReportProperties[privateField]) {
      resourceV2Mismatches.push(`ResourceV2IssueReportDto must not expose ${privateField}`);
    }
  }
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
  if (resourceV2Mismatches.length) throw new Error(`Resource Center V2 API contract mismatch: ${resourceV2Mismatches.join('; ')}`);
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
