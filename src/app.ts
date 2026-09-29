import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { v1Router } from './routes/v1.router.js';
import { requestIdMiddleware, errorHandler } from './common/middleware.js';

export function createApp() {
  const app = express();
  const configuredOrigins = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin = configuredOrigins.length === 1 ? configuredOrigins[0] : configuredOrigins;
  const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 120),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
  });

  // Standard middleware
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      (req as express.Request).rawBody = buffer.toString('utf8');
    },
  }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware);
  app.use('/v1', apiRateLimiter);

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
