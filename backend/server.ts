import { createApp } from './app.js';
import { seedDatabase } from './database/seed.js';
import { db } from './database/connection.js';
import { assertSecurityConfiguration } from './common/middleware.js';
import { IntegrationCronService } from './modules/integration/cron.service.js';
import type { Server } from 'node:http';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;

async function startServer() {
  let server: Server | null = null;
  let isReady = false;
  let initializationFinished = false;
  let shutdownRequested = false;
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    shutdownRequested = true;
    if (shuttingDown || !initializationFinished) return;
    shuttingDown = true;
    isReady = false;
    console.log(`[Server] ${signal} received; closing PharmaLink cleanly...`);
    IntegrationCronService.stop();
    server?.close((err) => {
      if (err) console.error('[Server] HTTP server shutdown error:', err);
      db.close().catch((dbErr) => {
        console.error('[Server] Database shutdown error:', dbErr);
        process.exitCode = 1;
      });
    });
  };

  try {
    assertSecurityConfiguration();

    // Claim the HTTP port before touching PGlite. PGlite cannot safely open
    // one data directory from two processes at once.
    const app = createApp(() => isReady);
    server = app.listen(PORT, '0.0.0.0');
    const listeningServer = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        listeningServer.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        listeningServer.removeListener('error', onError);
        resolve();
      };
      listeningServer.once('error', onError);
      listeningServer.once('listening', onListening);
    });

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    console.log('[Server] Initializing database & seed data...');
    await seedDatabase(process.env.NODE_ENV === 'test');
    initializationFinished = true;

    if (shutdownRequested) {
      shutdown('SIGINT');
      return;
    }

    isReady = true;
    console.log(`[Server] PharmaLink API running on http://localhost:${PORT}/v1`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    if (process.env.NODE_ENV !== 'test') {
      IntegrationCronService.start();
    }

    server.on('error', (err) => {
      console.error('[Server] Server error:', err);
    });
  } catch (err: any) {
    initializationFinished = true;
    if (server?.listening) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    await db.close().catch((closeErr) => {
      console.error('[Server] Database cleanup after startup failure failed:', closeErr);
    });

    if (err?.code === 'EADDRINUSE') {
      console.error(`[Server] Error: Port ${PORT} is already in use. Stop the existing server or choose another PORT.`);
      process.exitCode = 1;
      return;
    }
    console.error('[Server] Fatal startup error:', err);
    process.exitCode = 1;
  }
}

if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default startServer;
