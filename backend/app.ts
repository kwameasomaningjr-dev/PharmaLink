import fs from 'fs';
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

  const rateLimitFn: any = typeof rateLimit === 'function' ? rateLimit : (rateLimit as any)?.default || rateLimit;
  const helmetFn: any = typeof helmet === 'function' ? helmet : (helmet as any)?.default || helmet;
  const corsFn: any = typeof cors === 'function' ? cors : (cors as any)?.default || cors;

  const apiRateLimiter = rateLimitFn({
    windowMs: 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 120),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
  });

  // Standard middleware
  app.disable('x-powered-by');
  app.use(helmetFn({ contentSecurityPolicy: false }));
  app.use(corsFn({ origin: corsOrigin }));
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
  const frontendDistDir = path.resolve(process.cwd(), 'frontend/dist');
  const frontendPublicDir = path.resolve(process.cwd(), 'frontend/public');
  if (fs.existsSync(frontendDistDir)) {
    app.use(express.static(frontendDistDir));
  }
  if (fs.existsSync(frontendPublicDir)) {
    app.use(express.static(frontendPublicDir));
  }

  // V1 API Router
  app.use('/v1', v1Router);

  // Fallback to index.html for frontend navigation
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/v1')) {
      return next();
    }
    const htmlDistPath = path.join(frontendDistDir, 'index.html');
    if (fs.existsSync(htmlDistPath)) {
      return res.sendFile(htmlDistPath);
    }
    const htmlSrcPath = path.resolve(process.cwd(), 'frontend/index.html');
    if (fs.existsSync(htmlSrcPath)) {
      return res.sendFile(htmlSrcPath);
    }
    return res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GH PharmaLink — Real-time Medicine Availability & Pharmacy Network in Ghana</title>
  <link rel="stylesheet" href="/app.css">
  <script src="/app.js" defer></script>
</head>
<body>
  <div id="root">
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;">
      <div>Loading GH PharmaLink…</div>
    </div>
  </div>
</body>
</html>`);
  });

  // Error handling middleware
  app.use(errorHandler);

  return app;
}

export default createApp();
