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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

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
  await initializeDatabase();

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
