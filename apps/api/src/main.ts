import { ApiErrorFilter } from './runtime/api-error.filter.js';
import type { Request, Response, NextFunction } from 'express';
import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { repositoryRoot } from './config.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';
async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { abortOnError: false });
  app.enableCors({ origin: config.webOrigin });
  app.useGlobalFilters(new ApiErrorFilter());
  const origins = new Set([config.webOrigin, config.webOrigin.replace('localhost', '127.0.0.1'), config.webOrigin.replace('127.0.0.1', 'localhost')]);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ message: 'Origin không được phép.' });
    if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ message: 'Yêu cầu application/json.' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); next();
  });
  app.enableShutdownHooks();
  if (config.serveWeb) app.useStaticAssets(resolve(repositoryRoot, 'apps/web/dist'));
  await app.listen(config.port, config.host);
}
bootstrap().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
