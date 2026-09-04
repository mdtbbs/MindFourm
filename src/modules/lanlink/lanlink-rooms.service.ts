import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';

export interface LanLinkPublicRoom {
  code: string;
  name: string;
  display_name: string;
  owner: { display_name: string };
  node: { id: string; name: string };
}

export interface LanLinkPublicRooms {
  rooms: LanLinkPublicRoom[];
}

/**
 * Read-only adapter for LanLink's anonymous public-room endpoint.  The mobile
 * API deliberately projects only display data: direct endpoints and ports are
 * not needed to browse a room and should not become a new client contract.
 */
@Injectable()
export class LanLinkRoomsService {
  constructor(private readonly config: ConfigService) {}

  async getPublicRooms(): Promise<LanLinkPublicRooms> {
    const enabled = this.config.get<boolean>('lanlink.enabled');
    const baseUrl = this.config.get<string>('lanlink.baseUrl')?.trim();
    if (!enabled || !baseUrl) {
      throw new ApiV1Exception(
        'LANLINK_UNAVAILABLE',
        HttpStatus.SERVICE_UNAVAILABLE,
        '联机大厅暂未启用',
        false,
      );
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/rooms/public`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ApiV1Exception(
        'LANLINK_UNAVAILABLE',
        HttpStatus.BAD_GATEWAY,
        '联机大厅暂时无法连接，请稍后重试',
        true,
      );
    }

    if (!response.ok) {
      throw new ApiV1Exception(
        'LANLINK_UNAVAILABLE',
        HttpStatus.BAD_GATEWAY,
        '联机大厅暂时无法连接，请稍后重试',
        true,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiV1Exception(
        'LANLINK_UPSTREAM_INVALID',
        HttpStatus.BAD_GATEWAY,
        '联机大厅返回了无效数据',
        true,
      );
    }

    return { rooms: this.projectRooms(payload) };
  }

  private projectRooms(payload: unknown): LanLinkPublicRoom[] {
    const source = isRecord(payload) && Array.isArray(payload.rooms) ? payload.rooms : null;
    if (!source) {
      throw new ApiV1Exception(
        'LANLINK_UPSTREAM_INVALID',
        HttpStatus.BAD_GATEWAY,
        '联机大厅返回了无效数据',
        true,
      );
    }

    return source.flatMap((value): LanLinkPublicRoom[] => {
      if (!isRecord(value) || value.public !== true) return [];
      const code = stringValue(value.code).trim();
      if (!code) return [];

      const owner = isRecord(value.owner) ? value.owner : {};
      const node = isRecord(value.node) ? value.node : {};
      return [{
        code,
        name: stringValue(value.name),
        display_name: stringValue(value.display_name),
        owner: { display_name: stringValue(owner.display_name) || '匿名房主' },
        node: {
          id: stringValue(node.id),
          name: stringValue(node.name) || stringValue(node.id) || '未知节点',
        },
      }];
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
