import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from '@common/utils/client-context.util';
import { SecurityAccessLogsService } from './security-access-logs.service';

type AccessTarget = { route: string; resource_type?: string; resource_id?: string };

export function classifySecurityAccess(path: string, method: string, statusCode: number): AccessTarget | null {
  const pathname = path.split('?')[0].replace(/\/$/, '') || '/';
  if (/^\/api\/admin(?:\/|$)/i.test(pathname)) return { route: normalizeRoute(pathname) };
  if (/^\/api\/auth\/(?:login|oauth\/(?:callback|exchange)|callback|token)(?:\/|$)/i.test(pathname)) {
    return { route: normalizeRoute(pathname) };
  }
  if (statusCode >= 400 && (/^\/api\/v1\//i.test(pathname) || /^\/api\/(?:admin|auth)(?:\/|$)/i.test(pathname))) {
    return { route: normalizeRoute(pathname) };
  }
  if (method.toUpperCase() !== 'GET') return null;
  const patterns: Array<{ regex: RegExp; type: string; route: string }> = [
    { regex: /^\/api\/resources\/([A-Za-z0-9_-]+)\/download(?:\/file)?$/i, type: 'resource', route: '/api/resources/:resourceId/download' },
    { regex: /^\/api\/resources\/([A-Za-z0-9_-]+)$/i, type: 'resource', route: '/api/resources/:resourceId' },
    { regex: /^\/api\/v1\/resources\/([A-Za-z0-9_-]+)(?:\/download)?$/i, type: 'resource', route: '/api/v1/resources/:resourceId' },
    { regex: /^\/api\/v1\/game-content\/(maps|blueprints)\/([A-Za-z0-9_-]+)(?:\/download\/file)?$/i, type: 'map', route: '/api/v1/game-content/:kind/:resourceId' },
  ];
  for (const pattern of patterns) {
    const match = pattern.regex.exec(pathname);
    if (!match) continue;
    const target: AccessTarget = { route: pattern.route, resource_type: pattern.type };
    if (pattern.type === 'map') {
      target.resource_type = match[1].toLowerCase() === 'maps' ? 'map' : 'schematic';
      target.resource_id = match[2];
    } else target.resource_id = match[1];
    return target;
  }
  return null;
}

function normalizeRoute(path: string): string {
  return path.split('/').map((segment) => /^\d+$/.test(segment) ? ':id' : segment).join('/').slice(0, 255);
}

@Injectable()
export class SecurityAccessLogsMiddleware implements NestMiddleware {
  constructor(private readonly logs: SecurityAccessLogsService) {}

  use(request: Request & { requestId?: string; user?: { id?: number }; clientIp?: string }, response: Response, next: NextFunction): void {
    response.once('finish', () => {
      const target = classifySecurityAccess(request.path, request.method, response.statusCode);
      if (!target) return;
      void this.logs.record({
        request_id: request.requestId || 'unassigned',
        user_id: request.user?.id ?? null,
        method: request.method.toUpperCase().slice(0, 12),
        route: target.route,
        resource_type: target.resource_type ?? null,
        resource_id: target.resource_id ?? null,
        ip_address: request.clientIp || getClientIp(request),
        user_agent: request.headers['user-agent']?.slice(0, 512) ?? null,
        status_code: response.statusCode,
      }).catch((error) => console.error('Security access log write failed:', error instanceof Error ? error.message : 'unknown error'));
    });
    next();
  }
}
