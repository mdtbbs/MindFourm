import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { appConfig } from './config/app.config';
import { SiteConfigModule } from './config/site-config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './common/health.controller';
import { BanGuard } from './common/guards/ban.guard';
import { PhoneWriteGuard } from './common/guards/phone-write.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { SecurityModule } from './modules/security/security.module';
import { ContentSafetyModule } from './modules/content-safety/content-safety.module';
import { CommunityChallengesModule } from './modules/community-challenges/community-challenges.module';
import { PerformanceTelemetryModule } from './common/performance/performance-telemetry.module';
import { CommunityCoreModule } from './modules/community-core/community-core.module';
import { MdtbbsDomainModule } from './modules/mdtbbs-domain/mdtbbs-domain.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ScheduleModule.forRoot(),
    SiteConfigModule,
    DatabaseModule,
    RateLimitModule,
    PrivacyModule,
    SecurityModule,
    ContentSafetyModule,
    CommunityChallengesModule,
    PerformanceTelemetryModule,
    // Avatars and public embeds are public by design. Private attachment and
    // resource files continue to be streamed through their visibility checks.
    //
    // `exclude` keeps every file request off @nestjs/serve-static's render
    // fallback: without it a missing file is handled by `res.sendFile` on the
    // mount root, which throws ENOENT for the whole mount (500 for a deleted
    // avatar instead of 404). Excluding the mount makes express.static the only
    // handler, so a miss falls through to the app's own 404. `fallthrough: true`
    // is required for that to happen at all.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'avatars'),
      serveRoot: '/uploads/avatars',
      exclude: ['/uploads/avatars/(.*)'],
      serveStaticOptions: { fallthrough: true },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'public-images'),
      serveRoot: '/uploads/public-images',
      exclude: ['/uploads/public-images/(.*)'],
      serveStaticOptions: { fallthrough: true },
    }),
    // Browser-served public images. The static root is `uploads/public-images`
    // (the backend's public image directory) rather than the repository
    // `public/` directory, which the production image does not ship: when the
    // directory is missing, the render fallback throws ENOENT for every request
    // under the mount and turns it into a 500.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'public-images'),
      serveRoot: '/public',
      exclude: ['/public/(.*)'],
      serveStaticOptions: { fallthrough: true },
    }),
    CommunityCoreModule,
    MdtbbsDomainModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: BanGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PhoneWriteGuard },
  ],
})
export class AppModule {}
