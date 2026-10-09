// Documented backend/API gate (CLAUDE.md, docs/production-deployment.md):
//   npm ci && npm test
// Only the root `npm ci` runs there, so the backend suite must be
// self-contained: it may not resolve anything out of `frontend/node_modules`.
// Every suite below is a frontend-rendering test that needs those packages;
// they run through the frontend toolchain instead (`frontend` pipeline and
// `cd frontend && npm ci && npm test`). Excluding them here keeps the root
// gate deterministic instead of depending on which install happened first.
const FRONTEND_RENDERING_SPECS = [
  // Renders Tiptap components with `lowlight`/`@tiptap/*` from frontend deps.
  '<rootDir>/src/common/utils/tiptap-content.contract.spec.ts',
  // Renders React components straight out of the frontend app.
  '<rootDir>/src/modules/resources/wave-editor-render.spec.ts',
  '<rootDir>/tests/frontend/',
  '<rootDir>/tests/unit/active-users-metric.spec.ts',
  '<rootDir>/tests/unit/reply-thread.spec.ts',
  '<rootDir>/tests/unit/services/forum-batch-fetch.spec.ts',
];

// `sanitize-html` pulls in htmlparser2 v12, which is ESM-only. Node 22.12+ loads
// it through require(esm), but Jest's CJS runtime cannot — so that dependency
// chain has to be transpiled instead of ignored.
// `sanitize-html` itself is CJS, but it must be listed too: the ESM files live at
// node_modules/sanitize-html/node_modules/htmlparser2/, and an ignore pattern
// matching at *any* position would otherwise bail out on the first segment.
const ESM_ONLY_DEPS = [
  'uuid',
  'sanitize-html',
  // The ESM-only htmlparser2 dependency chain, as installed under sanitize-html.
  'htmlparser2',
  'domhandler',
  'domutils',
  'domelementtype',
  'dom-serializer',
  'entities',
];

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  // `.tsx` as well: shared React components are covered from the root suite, which
  // already maps `@/` to frontend/src and transpiles with the React JSX runtime.
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/tests/e2e/',
    ...FRONTEND_RENDERING_SPECS,
  ],
  transform: {
    '^.+\\.[cm]?[tj]sx?$': [
      'ts-jest',
      {
        // allowJs lets the ESM dependencies above be compiled down to CJS.
        tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022', jsx: 'react-jsx' },
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: [
    // `[\\\\/]` keeps this working with Windows path separators.
    `node_modules[\\\\/](?!(${ESM_ONLY_DEPS.join('|')})[\\\\/])`,
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/frontend/src/$1',
    '^@entities/(.*)$': '<rootDir>/src/entities/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
  },
};
