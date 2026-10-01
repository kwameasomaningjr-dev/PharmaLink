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
  try {
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
  } catch (fatalErr: any) {
    console.error('[Vercel Serverless] Fatal request error:', fatalErr);
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          code: 'SERVERLESS_ERROR',
          message: fatalErr.message || 'Internal Server Error',
        },
      });
    }
  }
}
