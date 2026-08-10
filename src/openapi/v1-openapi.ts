import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CapabilitiesModule } from '../modules/capabilities/capabilities.module';
import { ResourcesModule } from '../modules/resources/resources.module';
import { ThreadsModule } from '../modules/threads/threads.module';
import { DiscoverModule } from '../modules/discover/discover.module';
import { PortalModule } from '../modules/portal/portal.module';

export function createV1OpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('MDTBBS First-party API')
    .setDescription('Stable V1 contract for MDTBBS first-party clients')
    .setVersion('1.0.0')
    .build();

  return SwaggerModule.createDocument(app, config, {
    include: [
      CapabilitiesModule,
      ResourcesModule,
      ThreadsModule,
      DiscoverModule,
      PortalModule,
    ],
  });
}
