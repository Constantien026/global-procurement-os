'use strict';

/**
 * Database CLI.
 *   npm run seed   → insert demo data only if the database is empty
 *   npm run reset  → wipe every table, then re-seed demo data
 */

const { DB_PATH, seedIfEmpty, resetAndSeed } = require('./db');

const reset = process.argv.includes('--reset');

console.log(`\n  database: ${DB_PATH}\n`);

if (reset) {
  const summary = resetAndSeed();
  console.log('  reset complete — demo data restored:');
  console.log(`    ${summary.users} users · ${summary.suppliers} suppliers · ${summary.products} products · ${summary.rfqs} rfqs · ${summary.conversations} conversations`);
} else {
  const summary = seedIfEmpty();
  if (summary) {
    console.log('  seeded demo data:');
    console.log(`    ${summary.users} users · ${summary.suppliers} suppliers · ${summary.products} products · ${summary.rfqs} rfqs · ${summary.conversations} conversations`);
  } else {
    console.log('  database already contains data — nothing to seed (use npm run reset to start over)');
  }
}

console.log('');
console.log('  demo logins');
console.log('    buyer    ada@buyer.demo             / demo1234');
console.log('    buyer    nora@buyer.demo            / demo1234');
console.log('    supplier liam@supplier.demo         / demo1234');
console.log('    supplier rep1..rep9@supplier.demo   / demo1234   (one per supplier profile)');
console.log('    admin    admin@globalprocurement.os / admin1234');
console.log('');
