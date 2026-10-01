import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/database/seed.js';

let appInstance: any = null;
let initPromise: Promise<void> | null = null;

function getApp() {
  if (!appInstance) {
    appInstance = createApp();
  }
  return appInstance;
}

export default async function handler(req: any, res: any) {
  if (!initPromise) {
    initPromise = seedDatabase(false).catch((err) => {
      console.warn('[Vercel Serverless] Database initialization warning:', err);
    });
  }
  try {
    await initPromise;
  } catch {}
  const app = getApp();
  return app(req, res);
}
