import { db } from './connection.js';
import { SCHEMA_SQL } from './schema.js';

let activeMigration: Promise<void> | null = null;

export async function runMigrations() {
  if (activeMigration) return activeMigration;

  activeMigration = (async () => {
    console.log('[Migration] Starting database migration...');
    await db.exec(SCHEMA_SQL);
    console.log('[Migration] Schema migration completed successfully.');
  })().finally(() => {
    activeMigration = null;
  });

  return activeMigration;
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration] Failed:', err);
      process.exit(1);
    });
}
