import { createApp } from './app.js';
import { seedDatabase } from './database/seed.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    console.log('[Server] Initializing database & seed data...');
    await seedDatabase(true);

    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log(`[Server] PharmaLink API running on http://localhost:${PORT}/v1`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Error: Port ${PORT} is already in use.`);
        console.error(`[Server] Please stop the process using port ${PORT} or specify a different port (e.g. PORT=4001 npm run dev).`);
        process.exit(1);
      } else {
        console.error('[Server] Server error:', err);
      }
    });
  } catch (err) {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();
