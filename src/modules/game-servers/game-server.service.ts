import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameServer } from '@entities/game-server.entity';
import { GameServerSnapshot } from '@entities/game-server-snapshot.entity';

export type GameServerDto = {
  id: number; public_id: string; name: string; slug: string | null;
  description: string | null; hostname: string; port: number;
  protocol: string | null; server_type: string; status: string; is_public: boolean;
  latest_snapshot: { is_online: boolean; player_count: number | null; max_players: number | null; map_name: string | null; captured_at: string } | null;
};

@Injectable()
export class GameServerService {
  constructor(
    @InjectRepository(GameServer) private readonly serverRepo: Repository<GameServer>,
    @InjectRepository(GameServerSnapshot) private readonly snapshotRepo: Repository<GameServerSnapshot>,
  ) {}

  async listPublicServers(): Promise<GameServerDto[]> {
    const servers = await this.serverRepo.find({ where: { is_public: true }, order: { name: 'ASC' } });
    return Promise.all(servers.map(s => this.toDto(s)));
  }

  async getServerDetail(serverId: number): Promise<GameServerDto | null> {
    const server = await this.serverRepo.findOne({ where: { id: serverId } });
    if (!server || !server.is_public) return null;
    return this.toDto(server);
  }

  async recordSnapshot(serverId: number, data: { isOnline: boolean; playerCount: number | null; maxPlayers: number | null; mapName: string | null }): Promise<void> {
    const snapshot = new GameServerSnapshot();
    snapshot.game_server_id = serverId;
    snapshot.is_online = data.isOnline;
    snapshot.player_count = data.playerCount;
    snapshot.max_players = data.maxPlayers;
    snapshot.map_name = data.mapName;
    await this.snapshotRepo.save(snapshot);
  }

  private async toDto(server: GameServer): Promise<GameServerDto> {
    const snap = await this.snapshotRepo.findOne({ where: { game_server_id: server.id }, order: { captured_at: 'DESC' } });
    return {
      id: server.id, public_id: server.public_id, name: server.name, slug: server.slug || null,
      description: server.description || null, hostname: server.hostname, port: server.port,
      protocol: server.protocol, server_type: server.server_type, status: server.status, is_public: server.is_public,
      latest_snapshot: snap ? { is_online: snap.is_online, player_count: snap.player_count, max_players: snap.max_players, map_name: snap.map_name, captured_at: snap.captured_at?.toISOString() || '' } : null,
    };
  }
}
