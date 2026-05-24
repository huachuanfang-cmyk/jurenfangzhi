import { spawnSync } from 'node:child_process';

const commands = [
  [process.execPath, ['tools/guard/regression-tests.mjs'], 'regression guard'],
  [process.execPath, ['tools/guard/dirty-sync-tests.mjs'], 'dirty sync guard'],
  [process.execPath, ['tools/guard/search-tests.mjs'], 'search guard'],
  [process.execPath, ['tools/guard/material-search-tests.mjs'], 'material search guard'],
  [process.execPath, ['tools/guard/order-filter-tests.mjs'], 'order filter guard'],
  [process.execPath, ['tools/guard/dashboard-status-tests.mjs'], 'dashboard status guard'],
  [process.execPath, ['tools/guard/dyeing-task-tests.mjs'], 'dyeing task guard'],
  [process.execPath, ['tools/guard/sync-safety-tests.mjs'], 'sync safety guard'],
  [process.execPath, ['tools/guard/print-style-tests.mjs'], 'print style guard'],
  [process.execPath, ['tools/guard/print-content-tests.mjs'], 'print content guard'],
  [process.execPath, ['tools/guard/data-audit.mjs'], 'data audit'],
  [process.execPath, ['tools/guard/print-snapshot-tests.mjs'], 'print snapshot guard'],
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
