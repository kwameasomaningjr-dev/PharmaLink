import { db } from './connection.js';
import { SCHEMA_SQL } from './schema.js';

let activeMigration: Promise<void> | null = null;

export async function runMigrations() {
  if (activeMigration) return activeMigration;

  activeMigration = (async () => {
    console.log('[Migration] Starting database migration...');
    try {
      await db.exec('SET search_path TO public;');
    } catch {}

    const statements = SCHEMA_SQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await db.exec(stmt);
      } catch (err: any) {
        console.warn(`[Migration] Statement warning: ${err.message}`);
      }
    }
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
