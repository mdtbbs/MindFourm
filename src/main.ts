import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  app.use((req: any, _res: any, next: () => void) => {
    req.cookies = req.cookies || parseCookieHeader(req.headers?.cookie);
    next();
  });
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

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`MindFourm NestJS running on http://localhost:${port}`);
}

bootstrap();
