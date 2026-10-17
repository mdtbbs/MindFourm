import { strict as assert } from 'node:assert';

/**
 * The frontend spec files are a mix of Jest suites and plain IIFE scripts that
 * assert on import. The IIFE ones only run when Jest loads them, so they are
 * dropped without an error the moment the runner stops recognising them - which
 * is exactly what happened while the root and frontend gates both claimed the
 * same files. Keeping one real Jest test here makes that failure loud.
 */
it('runs frontend specs under Jest with assertions available', () => {
  assert.equal(typeof expect, 'function');
  expect(typeof describe).toBe('function');
});
