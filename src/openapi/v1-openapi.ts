import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
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
import { GameContentModule } from '../modules/game-content/game-content.module';
import { SearchModule } from '../modules/search/search.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { SocialModule } from '../modules/social/social.module';
import { MultiplayerModule } from '../modules/multiplayer/multiplayer.module';
import { PresenceModule } from '../modules/presence/presence.module';
import { RealtimeGatewayModule } from '../modules/realtime/realtime-gateway.module';
import { GameSavesModule } from '../modules/game-saves/game-saves.module';
import { API_V1_VERSION } from './api-version';

function keepOnlyV1Paths(document: OpenAPIObject): OpenAPIObject {
  // Several feature modules still contain both legacy and V1 controllers.
  // `include` works at module granularity, so Swagger would otherwise leak
  // legacy `/resources`, `/reports`, `/feedback`, etc. into the public V1
  // contract. The first-party specification must describe only `/api/v1/*`.
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => path === '/v1' || path.startsWith('/v1/')),
  );

  return document;
}

export function createV1OpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('MDTBBS Public Client API')
    .setDescription(
      'Stable V1 contract for web, official applications and third-party public clients. '
      + 'Use /api/v1/capabilities for feature discovery. '
      + 'External server integrations use the separate /api/external/v1 API key boundary. '
      + 'JSON V1 endpoints return the { data, meta } / { error, meta } envelope unless explicitly documented as a raw file or image response.',
    )
    .setVersion(API_V1_VERSION)
    .addServer('/api', 'Same-origin MindFourm API')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'MindAuth access token' },
      'MindAuthBearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
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
      GameContentModule,
      GameSavesModule,
      SearchModule,
      NotificationsModule,
      MessagesModule,
      SocialModule,
      MultiplayerModule,
      PresenceModule,
      RealtimeGatewayModule,
    ],
  });

  return keepOnlyV1Paths(document);
}
