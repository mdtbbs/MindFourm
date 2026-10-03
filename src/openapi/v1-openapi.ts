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
import { PacksModule } from '../modules/packs/packs.module';
import { API_V1_VERSION } from './api-version';
import { PUBLIC_V1_OPERATION_ALLOWLIST } from './public-v1-operation-allowlist';

const OPENAPI_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
const PUBLIC_OPERATION_KEYS = new Set(PUBLIC_V1_OPERATION_ALLOWLIST);

function keepOnlyV1Paths(document: OpenAPIObject): OpenAPIObject {
  // Several feature modules still contain both legacy and V1 controllers.
  // `include` works at module granularity, so Swagger would otherwise leak
  // legacy `/resources`, `/reports`, `/feedback`, etc. into the public V1
  // contract. The first-party specification must describe only `/api/v1/*`.
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => path === '/v1' || path.startsWith('/v1/')),
  );

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of OPENAPI_METHODS) {
      const operation = (pathItem as any)[method];
      if (!operation || operation['x-rate-limit']) continue;
      const isWrite = ['post', 'put', 'patch', 'delete'].includes(method);
      operation['x-rate-limit'] = {
        limit: isWrite ? 180 : 1200,
        window_seconds: 60,
        basis: 'authenticated_user_or_session_or_ip',
      };
    }
  }

  return document;
}

function collectComponentReferences(value: unknown, references: Map<string, Set<string>>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectComponentReferences(item, references);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === '$ref' && typeof child === 'string') {
      const match = child.match(/^#\/components\/([^/]+)\/(.+)$/);
      if (match) {
        const [, group, rawName] = match;
        const name = rawName.replaceAll('~1', '/').replaceAll('~0', '~');
        if (!references.has(group)) references.set(group, new Set());
        references.get(group)!.add(name);
      }
    } else {
      collectComponentReferences(child, references);
    }
  }
}

function pruneUnreferencedComponents(document: OpenAPIObject): void {
  const components = document.components;
  if (!components) return;

  const references = new Map<string, Set<string>>();
  const expanded = new Set<string>();
  const securitySchemes = new Set<string>();
  collectComponentReferences(document.paths, references);

  for (const pathItem of Object.values(document.paths || {})) {
    for (const method of OPENAPI_METHODS) {
      const operation = (pathItem as any)[method];
      for (const requirement of operation?.security || []) {
        for (const name of Object.keys(requirement || {})) securitySchemes.add(name);
      }
    }
  }

  for (const name of securitySchemes) {
    if (!references.has('securitySchemes')) references.set('securitySchemes', new Set());
    references.get('securitySchemes')!.add(name);
  }

  while (true) {
    const next: Array<[string, string]> = [];
    for (const [group, names] of references) {
      for (const name of names) {
        const key = `${group}/${name}`;
        if (!expanded.has(key)) {
          expanded.add(key);
          next.push([group, name]);
        }
      }
    }
    if (!next.length) break;
    for (const [group, name] of next) {
      const component = (components as any)[group]?.[name];
      if (component) collectComponentReferences(component, references);
    }
  }

  for (const [group, values] of Object.entries(components as Record<string, unknown>)) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    const retained = references.get(group) || new Set<string>();
    (components as any)[group] = Object.fromEntries(
      Object.entries(values as Record<string, unknown>).filter(([name]) => retained.has(name)),
    );
  }
}

export function filterPublicV1Operations(document: OpenAPIObject): OpenAPIObject {
  const found = new Set<string>();
  const paths: OpenAPIObject['paths'] = {};

  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(pathItem || {})) {
      if (!OPENAPI_METHODS.includes(key as typeof OPENAPI_METHODS[number])) {
        filtered[key] = value;
        continue;
      }
      const operationKey = `${key.toUpperCase()} ${path}`;
      if (!PUBLIC_OPERATION_KEYS.has(operationKey)) continue;
      found.add(operationKey);
      const operation = { ...(value as Record<string, unknown>) };
      if (!operation['x-rate-limit']) {
        const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(key.toUpperCase());
        operation['x-rate-limit'] = {
          limit: isWrite ? 180 : 1200,
          window_seconds: 60,
          basis: 'authenticated_user_or_session_or_ip',
        };
      }
      filtered[key] = operation;
    }
    if (Object.keys(filtered).some((key) => OPENAPI_METHODS.includes(key as typeof OPENAPI_METHODS[number]))) {
      paths[path] = filtered as any;
    }
  }

  const missing = PUBLIC_V1_OPERATION_ALLOWLIST.filter((key) => !found.has(key));
  if (missing.length) {
    throw new Error(`Public V1 allowlist operations are missing from the internal contract: ${missing.join(', ')}`);
  }

  document.paths = paths;
  const publicTags = new Set<string>();
  for (const pathItem of Object.values(paths)) {
    for (const method of OPENAPI_METHODS) {
      for (const tag of (pathItem as any)[method]?.tags || []) publicTags.add(tag);
    }
  }
  if (document.tags) document.tags = document.tags.filter((tag) => publicTags.has(tag.name));
  pruneUnreferencedComponents(document);
  return document;
}

export function createInternalV1OpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('MDTBBS Internal V1 API')
    .setDescription(
      'Internal development contract. This specification may contain privileged operations and must not be exposed from the public developer portal. '
      + 'Third-party clients use the separately filtered Public Client V1 contract. '
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
      PacksModule,
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

/** Publicly supported third-party operations are explicitly opted in by method and path. */
export function createV1OpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = createInternalV1OpenApiDocument(app);
  document.info.title = 'MDTBBS Public Client API';
  document.info.description =
    'Stable V1 contract for MindAuth public clients. Use /api/v1/capabilities for feature discovery. '
    + 'Server-side integrations use a separate authorization boundary and are not part of this specification. '
    + 'JSON V1 endpoints return the { data, meta } / { error, meta } envelope unless explicitly documented as a raw file or image response.';
  return filterPublicV1Operations(document);
}
