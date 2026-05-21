import { spawnSync } from 'node:child_process';

const commands = [
  [process.execPath, ['tools/guard/regression-tests.mjs'], 'regression guard'],
  [process.execPath, ['tools/guard/data-audit.mjs'], 'data audit'],
];

let failed = false;

for (const [bin, args, label] of commands) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(bin, args, {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`\n${label} failed with exit code ${result.status}.`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log('\nERP guard passed.');
}
