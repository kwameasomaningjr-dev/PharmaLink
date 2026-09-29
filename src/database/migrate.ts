import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let activeMigration: Promise<void> | null = null;

export async function runMigrations() {
  if (activeMigration) return activeMigration;

  activeMigration = (async () => {
  console.log('[Migration] Starting database migration...');
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  await db.exec(sql);
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
