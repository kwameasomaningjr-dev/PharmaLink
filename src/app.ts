import express from 'express';
import cors from 'cors';
import path from 'path';
import { v1Router } from './routes/v1.router.js';
import { requestIdMiddleware, errorHandler } from './common/middleware.js';

export function createApp() {
  const app = express();

  // Standard middleware
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'pharmalink-api',
      time: new Date().toISOString(),
    });
  });

  // Static assets for Web App UI
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // V1 API Router
  app.use('/v1', v1Router);

  // Fallback to index.html for frontend navigation
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/v1')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Error handling middleware
  app.use(errorHandler);

  return app;
}
