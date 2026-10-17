// Documented backend gate (CLAUDE.md, docs/production-deployment.md):
//   npm ci && npm test
// Only the root `npm ci` runs there, so the root suite owns everything it is
// responsible for: suites through `modulePaths` below, and React through the
// mapper in `moduleNameMapper`.
//
// The suites listed here need more than that. They pull `@tiptap/*`,
// `tiptap-markdown` or a DOM harness that only exist under
// `frontend/node_modules`, so they belong to the `frontend` toolchain
// (`cd frontend && npm ci && npm test`). Excluding them keeps the root gate
// deterministic instead of depending on which install happened first.
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

// Absolute on purpose: `modulePaths` entries are not resolved through the
// mapper, so a `<rootDir>` token would be taken literally here.
const FRONTEND_NODE_MODULES = require('node:path').join(__dirname, 'frontend', 'node_modules');

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
  // React comes from the frontend install: it is where the version the app
  // builds against lives, and the root install does not carry it. `ts-jest`
  // compiles with `jsx: 'react-jsx'`, so the implicit `react/jsx-runtime` has
  // to resolve too — it is a real file in the package, but a subpath Jest only
  // reaches through the mapper (node's `exports` map is not consulted here).
  modulePaths: [FRONTEND_NODE_MODULES, '<rootDir>/node_modules'],
  moduleNameMapper: {
    '^react/jsx-runtime$': `${FRONTEND_NODE_MODULES}/react/jsx-runtime`,
    '^react/jsx-dev-runtime$': `${FRONTEND_NODE_MODULES}/react/jsx-dev-runtime`,
    '^react/(.*)$': `${FRONTEND_NODE_MODULES}/react/$1`,
    '^react$': `${FRONTEND_NODE_MODULES}/react`,
    '^react-dom/(.*)$': `${FRONTEND_NODE_MODULES}/react-dom/$1`,
    '^@/(.*)$': '<rootDir>/frontend/src/$1',
    '^@entities/(.*)$': '<rootDir>/src/entities/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
  },
};
