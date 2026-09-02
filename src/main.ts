// Keep process.env deterministic for bootstrap-only switches. ConfigModule also
// consumes this file, but routes registered during bootstrap must not depend on
// a deployment runner's inherited environment.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import * as express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { initializeDatabase } from './database/database.module';
import { PointsService } from './modules/points/points.service';
import { PluginManagerService } from './modules/plugins/plugin-manager.service';
import { LevelsService } from './modules/levels/levels.service';
import { BadgesService } from './modules/badges/badges.service';
import { SettingsService } from './modules/settings/settings.service';
import { ResourceCategoryService } from './modules/resources/resource-categories.service';
import { DataSource } from 'typeorm';
import { csrfMiddleware } from './common/middleware/csrf.middleware';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { clientContextMiddleware } from './common/middleware/client-context.middleware';
import { SwaggerModule } from '@nestjs/swagger';
import { createV1OpenApiDocument } from './openapi/v1-openapi';
import { appConfig } from './config/app.config';
import { validateConfig } from './config/validate';
import { PerformanceTelemetryService } from './common/performance/performance-telemetry.service';

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) return cookies;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) return cookies;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
    // Register parsers explicitly below.  Relying on Nest's implicit parser
    // left `@Body()` empty in this application, making JSON admin mutations
    // fail validation even though the browser sent a valid payload.
    bodyParser: false,
  });

  // Runs after app creation so ConfigModule has loaded .env into process.env, but
  // before any database or Redis connection — a misconfigured production deployment
  // should refuse to start rather than fail later on the first login.
  validateConfig(appConfig());

  const isProduction = process.env.NODE_ENV === 'production';

  // Keep JSON parsing deterministic for every API route.  Multipart resource
  // and attachment uploads are handled separately by Multer and are not
  // consumed by these parsers.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Behind nginx, X-Forwarded-For must be trusted or every request appears to come
  // from the loopback proxy — which would collapse rate limiting into one bucket,
  // make IP bans match all-or-nothing, and record 127.0.0.1 in every audit row.
  // The production origin is reached through the CDN only.  Application code
  // reads X-Forwarded-For directly as the client IP source, and Express must
  // apply the same policy for its own request helpers.
  app.set('trust proxy', true);

  const performanceTelemetry = app.get(PerformanceTelemetryService);
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      void performanceTelemetry.record(req.path, res.statusCode, durationMs);
    });
    next();
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // CSP reports use application/csp-report or application/reports+json rather
  // than ordinary application/json, so register a narrow parser before routes.
  app.use('/api/security/csp-reports', express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '32kb',
  }));

  app.use(
    helmet({
      strictTransportSecurity: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false, // disabled in dev so plain HTTP still works
      // This service returns JSON and streams uploaded files; it serves no HTML of
      // its own, so the policy only has to be restrictive enough that a stored
      // payload cannot execute if a response is ever rendered directly.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      // Downloads are served cross-origin to the Next.js frontend.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      xFrameOptions: { action: 'sameorigin' },
      xXssProtection: false,
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use((_req, res, next) => {
    // Keep origin responses consistent with ESA's security-header contract.
    // Helmet intentionally emits X-XSS-Protection: 0, so this legacy ESA
    // compatibility header must be set explicitly after Helmet.
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
    next();
  });

  app.use(compression());

  app.use((req: any, _res: any, next: () => void) => {
    req.cookies = req.cookies || parseCookieHeader(req.headers?.cookie);
    next();
  });
  app.use(clientContextMiddleware);
  app.use(requestIdMiddleware);
  app.use(csrfMiddleware);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global filters
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Initialize database schema if needed
  await initializeDatabase(app.get(DataSource));

  // Initialize default settings after schema creation. This is explicit because
  // module hooks run before the empty-database bootstrap can create tables.
  const settingsService = app.get(SettingsService);
  await settingsService.seedDefaults();

  // Initialize default resource categories for the resource center.
  const resourceCategoryService = app.get(ResourceCategoryService);
  await resourceCategoryService.initializeDefaultCategories();

  // Initialize default point rules
  const pointsService = app.get(PointsService);
  await pointsService.initializeDefaultRules();

  // Initialize default levels
  const levelsService = app.get(LevelsService);
  await levelsService.initializeDefaultLevels();

  // Initialize default badges
  const badgesService = app.get(BadgesService);
  await badgesService.initializeDefaultBadges();

  // Load active plugins
  const pluginManager = app.get(PluginManagerService);
  await pluginManager.loadPlugins();

  // The contract is intentionally public and contains only explicitly included
  // V1 modules. Keep it on by default so a missing deployment flag cannot make
  // the supported Mod API undocumented; restricted installations may opt out.
  if (app.get(ConfigService).get<string>('OPENAPI_ENABLED') !== 'false') {
    const document = createV1OpenApiDocument(app);
    SwaggerModule.setup('api/docs/v1', app, document);
    app.getHttpAdapter().get('/api/openapi/v1.json', (_req: unknown, res: any) => res.json(document));
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`MindFourm NestJS running on http://localhost:${port}`);
}

bootstrap();
