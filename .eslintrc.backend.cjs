// Backend ESLint gate.
//
// Scope is deliberately narrow: it enforces correctness rules that the tree
// already satisfies, so the gate starts green and can be widened as the code is
// cleaned up. Stylistic rules the compiler already covers (const-assertions,
// escape characters in intentionally-explicit regexes, `Function` in test
// doubles) are off — enabling them today would mean a repo-wide churn commit
// unrelated to any behaviour change.
module.exports = {
  root: true,
  env: { node: true, es2022: true, jest: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist/', 'node_modules/', 'frontend/', 'coverage/', 'tools/', 'uploads/'],
  rules: {
    // Correctness rules that catch real defects and hold on the current tree.
    'no-dupe-args': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
    'no-cond-assign': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-unsafe-negation': 'error',
    'no-self-compare': 'error',
    'valid-typeof': 'error',
    // The backend is a TypeScript tree; the JS-only checks in `eslint:recommended`
    // that misfire on type syntax are disabled.
    'no-undef': 'off',
    // `url-slug.util.ts` matches the U+3000 ideographic space inside a CJK
    // character class; that is intentional, not a stray whitespace.
    'no-irregular-whitespace': ['error', { skipRegExps: true }],
    // `resource-storage-migrate.ts` passes an async generator to `stream.pipeline`
    // purely for its side effects; it never needs to yield a value.
    'require-yield': 'off',
    'no-unused-vars': 'off',
    'no-redeclare': 'off',
    'no-control-regex': 'off',
    'no-useless-escape': 'off',
  },
};
