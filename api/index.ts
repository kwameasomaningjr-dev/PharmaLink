import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';

let initialized = false;
const app = createApp();

export default async function handler(req: any, res: any) {
  if (!initialized) {
    try {
      await seedDatabase();
    } catch (e) {
      console.error('Database initialization warning:', e);
    }
    initialized = true;
  }
  return app(req, res);
}
