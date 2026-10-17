// Frontend test gate. Runs the suites that render - or read - frontend code
// with `frontend/node_modules` on the resolution path, which the root backend
// config deliberately avoids (see `FRONTEND_RENDERING_SPECS` in
// ../jest.config.js). Requires `npm ci` in `frontend/` and at the repo root.
//
// Run it via the repo root so ts-jest resolves the root install and the
// `process.cwd()`-relative repo paths in the specs stay valid:
//   npx jest --config frontend/jest.config.js
// `frontend/package.json` wires this up as `test:frontend-unit`, which forces
// `--rootDir ..` for exactly that reason — running it from inside `frontend/`
// would make `process.cwd()` == `<repo>/frontend` and break every repo path.
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rootNodeModules = path.join(root, 'node_modules');
const frontendNodeModules = path.join(__dirname, 'node_modules');

const FRONTEND_TEST_MATCH = [
  '<rootDir>/frontend/src/**/*.spec.ts',
  '<rootDir>/frontend/src/**/*.spec.tsx',
  '<rootDir>/tests/frontend/**/*.spec.ts',
  '<rootDir>/tests/unit/active-users-metric.spec.ts',
  '<rootDir>/tests/unit/reply-thread.spec.ts',
  '<rootDir>/tests/unit/services/forum-batch-fetch.spec.ts',
  '<rootDir>/src/common/utils/tiptap-content.contract.spec.ts',
  '<rootDir>/src/modules/resources/wave-editor-render.spec.ts',
];

// `sanitize-html` pulls in htmlparser2 v12, which is ESM-only, so that chain
// has to be transpiled instead of ignored. Keep in sync with ../jest.config.js.
const ESM_ONLY_DEPS = [
  'uuid',
  'sanitize-html',
  'htmlparser2',
  'domhandler',
  'domutils',
  'domelementtype',
  'dom-serializer',
  'entities',
  'lowlight',
  'highlight.js',
];

module.exports = {
  rootDir: root,
  // No `preset: 'ts-jest'`. The preset injects its own transform key holding
  // the bare name `ts-jest`, and jest resolves transform modules relative to
  // `rootDir` (the repo root) — which has no install when only
  // `cd frontend && npm ci` ran. `transform` below configures ts-jest by
  // absolute path instead, so the suite stays resolvable from
  // `frontend/node_modules` alone. The options match ts-jest's preset.
  testEnvironment: 'node',
  testMatch: FRONTEND_TEST_MATCH,
  transform: {
    '^.+\\.[cm]?[tj]sx?$': [
      path.join(frontendNodeModules, 'ts-jest'),
      {
        tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022', jsx: 'react-jsx', esModuleInterop: true },
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: [`node_modules[\\\\/](?!(${ESM_ONLY_DEPS.join('|')})[\\\\/])`],
  moduleNameMapper: {
    '^@/(.*)$': path.join(__dirname, 'src/$1'),
    '^react$': path.join(frontendNodeModules, 'react'),
    '^react/(.*)$': path.join(frontendNodeModules, 'react/$1'),
    '^react-dom/(.*)$': path.join(frontendNodeModules, 'react-dom/$1'),
    '^@tiptap/([^/]+)$': path.join(frontendNodeModules, '@tiptap/$1'),
    '^lowlight$': path.join(frontendNodeModules, 'lowlight'),
    '^tiptap-markdown$': path.join(frontendNodeModules, 'tiptap-markdown'),
  },
  // Root installs supply jsdom/sanitize-html, frontend installs supply React.
  modulePaths: [frontendNodeModules, rootNodeModules],
};
