#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
// Keep filtered runs and explicit Jest options intact. The default full suite
// needs fresh processes: a single ts-jest process can exceed the 1 GiB limit
// even with collection between files, on both Node 20 CI and Node 24 production.
const fullSuite = args.length === 0 || (args.length === 1 && args[0] === '--runInBand');
const batches = fullSuite
  ? [1, 2, 3, 4].map((index) => ['--runInBand', `--shard=${index}/4`])
  : [args];

for (const [index, batch] of batches.entries()) {
  if (fullSuite) console.log(`Backend test batch ${index + 1}/${batches.length}`);
  const result = spawnSync(process.execPath, [
    '--expose-gc', '--max-old-space-size=1024',
    require.resolve('jest/bin/jest'), '--logHeapUsage', ...batch,
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (result.signal) console.error(`Jest terminated by ${result.signal}`);
    process.exit(result.status ?? 1);
  }
}
