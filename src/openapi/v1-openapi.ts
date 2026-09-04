import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CapabilitiesModule } from '../modules/capabilities/capabilities.module';
import { MobileAuthV1Module } from '../modules/auth/mobile-auth-v1.module';
import { UsersV1Module } from '../modules/users/v1/users-v1.module';
import { ResourcesModule } from '../modules/resources/resources.module';
import { ThreadsModule } from '../modules/threads/threads.module';
import { DiscoverModule } from '../modules/discover/discover.module';
import { PortalModule } from '../modules/portal/portal.module';
import { NoticesModule } from '../modules/notices/notices.module';
import { BookmarksV1Module } from '../modules/bookmarks/v1/bookmarks-v1.module';
import { LanLinkModule } from '../modules/lanlink/lanlink.module';
import { FeedbackModule } from '../modules/feedback/feedback.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { UploadsModule } from '../modules/uploads/uploads.module';

export function createV1OpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('MDTBBS First-party API')
    .setDescription('Stable V1 contract for MDTBBS first-party clients. Clients must call /api/v1/capabilities first and must not infer unavailable features from undocumented endpoints.')
    .setVersion('1.0.0')
    .build();

  return SwaggerModule.createDocument(app, config, {
    include: [
      CapabilitiesModule,
      MobileAuthV1Module,
      UsersV1Module,
      ResourcesModule,
      ThreadsModule,
      DiscoverModule,
      PortalModule,
      NoticesModule,
      BookmarksV1Module,
      LanLinkModule,
      FeedbackModule,
      ReportsModule,
      UploadsModule,
    ],
  });
}
