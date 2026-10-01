import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RedisService } from '../../database/redis.service';
import { MultiplayerService } from '../multiplayer/multiplayer.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { SocialPrivacyService } from '../social/social-privacy.service';
import { FriendsService } from '../friends/friends.service';
import { PresenceService } from './presence.service';
import { PresencePolicyService } from './presence-policy.service';
import { SettingsService } from '../settings/settings.service';
import { randomBytes } from 'crypto';
import { UserPresencePreference, UserPresenceStatus } from '../../entities/user-presence-preference.entity';
import { PutRichActivityDto } from './dto/presence-v1.dto';

export const PRESENCE_CONNECTION_TTL_SECONDS = 90;
const PRESENCE_HEARTBEAT_SECONDS = 30;
const CONNECTION_INDEX_TTL_SECONDS = 180;

export interface PresenceConnectionRecord {
  connection_id: string;
  user_id: number;
  client_id: string;
  platform: string;
  created_at: number;
  last_seen_at: number;
}

export interface StoredActivity extends PutRichActivityDto {
  client_id: string;
  platform: string;
  updated_at: number;
}

export interface PresenceSnapshot {
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activity: StoredActivity | null;
  last_seen_at: number | null;
}

function id(): string { return `prs_${randomBytes(18).toString('base64url')}`; }
function fail(code: string): never {
  const payload = { code, message: code };
  if (code === 'PRESENCE_CONNECTION_NOT_FOUND') throw new NotFoundException(payload);
  if (code === 'ACTIVITY_INVALID') throw new BadRequestException(payload);
  throw new ForbiddenException(payload);
}
function connectionKey(connectionId: string) { return `presence:conn:${connectionId}`; }
function connectionIndexKey(userId: number) { return `presence:user:${userId}:connections`; }
function activityKey(connectionId: string) { return `activity:conn:${connectionId}`; }

@Injectable()
export class PresenceConnectionsService {
  constructor(
    private readonly redis: RedisService,
    private readonly privacy: SocialPrivacyService,
    private readonly policy: PresencePolicyService,
    private readonly friends: FriendsService,
    private readonly legacyPresence: PresenceService,
    private readonly multiplayer: MultiplayerService,
    private readonly realtime: RealtimeEventsService,
    private readonly settings: SettingsService,
    @InjectRepository(UserPresencePreference) private readonly preferences: Repository<UserPresencePreference>,
  ) {}

  async create(userId: number, clientId: string, platform: string, status?: UserPresenceStatus, thirdParty = false) {
    await this.requireEnabled('social_presence_v1');
    if (thirdParty) await this.multiplayer.assertThirdPartyClientCapability(clientId, 'supports_presence');
    await this.preferences.createQueryBuilder().insert().orIgnore().values({ user_id: userId }).execute();
    const connectionId = id();
    const now = Date.now();
    const record: PresenceConnectionRecord = { connection_id: connectionId, user_id: userId, client_id: clientId, platform, created_at: now, last_seen_at: now };
    await this.redis.set(connectionKey(connectionId), JSON.stringify(record), PRESENCE_CONNECTION_TTL_SECONDS);
    const indexKey = connectionIndexKey(userId);
    await this.redis.hset(indexKey, connectionId, JSON.stringify(record));
    await this.redis.expire(indexKey, CONNECTION_INDEX_TTL_SECONDS);
    if (status) await this.privacy.setStatus(userId, status);
    await this.syncLegacyPresence(userId);
    await this.emitToFriends(userId, 'presence.updated');
    return { connection_id: connectionId, heartbeat_interval: PRESENCE_HEARTBEAT_SECONDS, expires_in: PRESENCE_CONNECTION_TTL_SECONDS };
  }

  async patch(userId: number, connectionId: string, status?: UserPresenceStatus) {
    const record = await this.requireConnection(userId, connectionId);
    if (status) await this.privacy.setStatus(userId, status);
    record.last_seen_at = Date.now();
    await this.writeRecord(record);
    await this.syncLegacyPresence(userId);
    await this.emitToFriends(userId, 'presence.updated');
    return { connection_id: connectionId, status: status || (await this.privacy.get(userId)).status };
  }

  async heartbeat(userId: number, connectionId: string) {
    const record = await this.requireConnection(userId, connectionId);
    record.last_seen_at = Date.now();
    await this.writeRecord(record);
    await this.redis.expire(activityKey(connectionId), PRESENCE_CONNECTION_TTL_SECONDS);
    await this.syncLegacyPresence(userId);
    return { acknowledged: true, heartbeat_interval: PRESENCE_HEARTBEAT_SECONDS, expires_in: PRESENCE_CONNECTION_TTL_SECONDS };
  }

  async remove(userId: number, connectionId: string) {
    await this.requireConnection(userId, connectionId);
    const key = connectionIndexKey(userId);
    await Promise.all([
      this.redis.del(connectionKey(connectionId)),
      this.redis.del(activityKey(connectionId)),
      this.redis.hdel(key, connectionId),
    ]);
    await this.redis.expire(key, CONNECTION_INDEX_TTL_SECONDS);
    const left = Object.keys(await this.redis.hgetall(key));
    if (!left.length) await this.markLastSeen(userId, Date.now());
    await this.syncLegacyPresence(userId);
    await this.emitToFriends(userId, 'presence.updated');
    return { removed: true };
  }

  async putActivity(userId: number, connectionId: string, dto: PutRichActivityDto, thirdParty = false) {
    await this.requireEnabled('rich_activity_v1');
    const connection = await this.requireConnection(userId, connectionId);
    if (thirdParty) await this.multiplayer.assertThirdPartyClientCapability(connection.client_id, 'supports_presence');
    const name = dto.name.trim();
    if (!name) fail('ACTIVITY_INVALID');
    if (dto.join?.session_id) await this.multiplayer.validateActivitySession(userId, dto.join.session_id);
    const activity: StoredActivity = {
      type: dto.type,
      name,
      details: dto.details?.trim(),
      state: dto.state?.trim(),
      game: dto.game ? { id: dto.game.id.trim(), version: dto.game.version?.trim() } : undefined,
      party: dto.party ? { current: dto.party.current, max: dto.party.max } : undefined,
      timestamps: dto.timestamps ? { started_at: dto.timestamps.started_at } : undefined,
      join: dto.join?.session_id ? { session_id: dto.join.session_id } : undefined,
      client_id: connection.client_id,
      platform: connection.platform,
      updated_at: Date.now(),
    };
    await this.redis.set(activityKey(connectionId), JSON.stringify(activity), PRESENCE_CONNECTION_TTL_SECONDS);
    await this.syncLegacyPresence(userId);
    await this.emitToFriends(userId, 'activity.updated');
    return { updated: true };
  }

  async deleteActivity(userId: number, connectionId: string) {
    await this.requireConnection(userId, connectionId);
    await this.redis.del(activityKey(connectionId));
    await this.syncLegacyPresence(userId);
    await this.emitToFriends(userId, 'activity.updated');
    return { removed: true };
  }

  async getSnapshots(userIds: number[]): Promise<Map<number, PresenceSnapshot>> {
    const uniqueIds = [...new Set(userIds)];
    const result = new Map<number, PresenceSnapshot>();
    if (!uniqueIds.length) return result;
    const [indices, statuses] = await Promise.all([
      this.redis.hgetallMany(uniqueIds.map(connectionIndexKey)),
      this.privacy.statusForMany(uniqueIds),
    ]);
    const preferences = await this.preferences.findBy({ user_id: In(uniqueIds) });
    const preferenceByUser = new Map(preferences.map((item) => [item.user_id, item]));
    const indexByUser = new Map(uniqueIds.map((userId, index) => [userId, indices[index] || {}]));
    const connectionIds = [...new Set(indices.flatMap((index) => Object.keys(index || {})))].slice(0, uniqueIds.length * 20);
    const connectionValues = await this.redis.mget(...connectionIds.map(connectionKey));
    const connectionValueById = new Map(connectionIds.map((connectionId, index) => [connectionId, connectionValues[index]]));
    const liveByUser = new Map<number, PresenceConnectionRecord[]>();
    const live: Array<{ userId: number; record: PresenceConnectionRecord; activityIndex: number }> = [];
    const staleByUser = new Map<number, string[]>();
    for (const [userId, index] of indexByUser) {
      for (const connectionId of Object.keys(index)) {
        const raw = connectionValueById.get(connectionId);
        if (!raw) {
          const stale = staleByUser.get(userId) || [];
          stale.push(connectionId);
          staleByUser.set(userId, stale);
          continue;
        }
        try {
          const record = JSON.parse(raw) as PresenceConnectionRecord;
          if (record.user_id === userId && record.connection_id === connectionId) {
            live.push({ userId, record, activityIndex: -1 });
            const records = liveByUser.get(userId) || [];
            records.push(record);
            liveByUser.set(userId, records);
          }
          else staleByUser.set(userId, [...(staleByUser.get(userId) || []), connectionId]);
        } catch {
          staleByUser.set(userId, [...(staleByUser.get(userId) || []), connectionId]);
        }
      }
    }
    const activityValues = await this.redis.mget(...live.map(({ record }) => activityKey(record.connection_id)));
    const activitiesByUser = new Map<number, StoredActivity[]>();
    live.forEach(({ userId, record }, index) => {
      const raw = activityValues[index];
      if (!raw) return;
      try {
        const activity = JSON.parse(raw) as StoredActivity;
        activity.client_id = record.client_id;
        activity.platform = record.platform;
        const entries = activitiesByUser.get(userId) || [];
        entries.push(activity);
        activitiesByUser.set(userId, entries);
      } catch { /* Expired or malformed activity is hidden. */ }
    });
    for (const [userId, stale] of staleByUser) {
      if (stale.length) await this.redis.hdel(connectionIndexKey(userId), ...stale);
    }
    const lastSeenUpdates = new Map<number, number>();
    for (const userId of uniqueIds) {
      const preference = preferenceByUser.get(userId);
      const userLive = liveByUser.get(userId) || [];
      const manual = statuses.get(userId) || 'online';
      const invisible = manual === 'invisible';
      const isOnline = userLive.length > 0 && !invisible;
      const activities = activitiesByUser.get(userId) || [];
      const primary = activities.sort((a, b) => b.updated_at - a.updated_at)[0] || null;
      const status: PresenceSnapshot['status'] = !isOnline ? 'offline' : (manual as 'online' | 'idle' | 'dnd');
      if (!isOnline && userLive.length === 0) {
        const previous = Object.values(indexByUser.get(userId) || {}).flatMap((raw) => {
          try { return [JSON.parse(raw).last_seen_at as number]; } catch { return []; }
        }).filter(Number.isFinite);
        if (previous.length) lastSeenUpdates.set(userId, Math.max(...previous));
      }
      result.set(userId, {
        status,
        activity: isOnline && !invisible ? primary : null,
        last_seen_at: preference?.last_seen_at?.getTime() || null,
      });
    }
    for (const [userId, value] of lastSeenUpdates) {
      await this.markLastSeen(userId, value);
      const snapshot = result.get(userId);
      if (snapshot) snapshot.last_seen_at = value;
    }
    return result;
  }

  /**
   * Include authenticated legacy LanLink activity in the first-party social
   * feed, while keeping the legacy and OAuth connection lifetimes independent.
   */
  async getSocialSnapshots(userIds: number[]): Promise<Map<number, PresenceSnapshot>> {
    const uniqueIds = [...new Set(userIds)];
    const [snapshots, lanlinkPresences, statuses] = await Promise.all([
      this.getSnapshots(uniqueIds),
      this.legacyPresence.getLanLinkPresences(uniqueIds),
      this.privacy.statusForMany(uniqueIds),
    ]);
    for (const userId of uniqueIds) {
      const current = snapshots.get(userId);
      if ((current && current.status !== 'offline') || statuses.get(userId) === 'invisible') continue;
      const legacy = lanlinkPresences.get(userId);
      if (!legacy || !['online', 'hosting', 'playing'].includes(legacy.status)) continue;
      snapshots.set(userId, {
        status: 'online',
        last_seen_at: current?.last_seen_at || null,
        activity: legacy.status === 'hosting' || legacy.status === 'playing'
          ? {
              type: legacy.status,
              name: legacy.room_name?.trim() || (legacy.status === 'hosting' ? '正在主持游戏' : '正在游戏'),
              client_id: 'lanlink-mod',
              platform: 'lanlink',
              updated_at: Number(legacy.updated_at) || Date.now(),
            }
          : null,
      });
    }
    return snapshots;
  }

  private async requireConnection(userId: number, connectionId: string): Promise<PresenceConnectionRecord> {
    const raw = await this.redis.get(connectionKey(connectionId));
    if (!raw) fail('PRESENCE_CONNECTION_NOT_FOUND');
    let record: PresenceConnectionRecord;
    try { record = JSON.parse(raw); } catch { fail('PRESENCE_CONNECTION_NOT_FOUND'); }
    if (record.user_id !== userId) fail('PRESENCE_CONNECTION_NOT_FOUND');
    return record;
  }

  private async writeRecord(record: PresenceConnectionRecord) {
    await this.redis.set(connectionKey(record.connection_id), JSON.stringify(record), PRESENCE_CONNECTION_TTL_SECONDS);
    const index = connectionIndexKey(record.user_id);
    await this.redis.hset(index, record.connection_id, JSON.stringify(record));
    await this.redis.expire(index, CONNECTION_INDEX_TTL_SECONDS);
  }

  private async syncLegacyPresence(userId: number) {
    const snapshot = (await this.getSnapshots([userId])).get(userId);
    if (!snapshot || snapshot.status === 'offline') {
      await this.legacyPresence.deletePresence(userId);
      return;
    }
    await this.legacyPresence.setPresence(userId, {
      status: snapshot.activity?.type === 'playing' ? 'playing' : snapshot.activity?.type === 'hosting' ? 'hosting' : 'online',
      room_name: snapshot.activity?.name,
      updated_at: Date.now(),
    });
  }

  private async markLastSeen(userId: number, timestamp: number) {
    const row = await this.preferences.findOneBy({ user_id: userId });
    if (!row) return;
    row.last_seen_at = new Date(timestamp);
    await this.preferences.save(row);
  }

  private async emitToFriends(userId: number, event: string) {
    const friendIds = await this.legacyPresence.getFriendIds(userId);
    const [settings, snapshot, visibleTo] = await Promise.all([
      this.privacy.get(userId),
      this.getSnapshots([userId]),
      this.policy.canSeeFromManyViewers(userId, friendIds, 'presence_visibility'),
    ]);
    const presence = settings.status === 'invisible' ? 'offline' : snapshot.get(userId)?.status || 'offline';
    await Promise.all(friendIds.filter((friendId) => visibleTo.get(friendId)).map((friendId) =>
      this.realtime.emitUser(friendId, event, { user_id: userId, status: presence }),
    ));
  }

  private async requireEnabled(flag: string) {
    if (!(await this.settings.getBoolean(`feature_${flag}_enabled`, false))) {
      throw new ForbiddenException({ code: 'FEATURE_DISABLED', message: 'FEATURE_DISABLED' });
    }
  }
}
