import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Friendship } from '../../entities/friendship.entity';
import { SocialPrivacySetting, SocialVisibility } from '../../entities/social-privacy-setting.entity';
import { UserBlock } from '../../entities/user-block.entity';

@Injectable()
export class SocialPolicyService {
  constructor(
    @InjectRepository(Friendship) private readonly friendships: Repository<Friendship>,
    @InjectRepository(UserBlock) private readonly blocks: Repository<UserBlock>,
    @InjectRepository(SocialPrivacySetting) private readonly privacy: Repository<SocialPrivacySetting>,
  ) {}

  async areFriends(firstUserId: number, secondUserId: number): Promise<boolean> {
    if (firstUserId === secondUserId) return true;
    return this.friendships.exists({ where: [
      { requester_id: firstUserId, addressee_id: secondUserId, status: 'accepted' },
      { requester_id: secondUserId, addressee_id: firstUserId, status: 'accepted' },
    ] });
  }

  async areFriendsMany(viewerId: number, targetIds: number[]): Promise<Map<number, boolean>> {
    const ids = [...new Set(targetIds)].filter((id) => id !== viewerId);
    const rows = ids.length ? await this.friendships.find({ where: [
      { requester_id: viewerId, addressee_id: In(ids), status: 'accepted' },
      { requester_id: In(ids), addressee_id: viewerId, status: 'accepted' },
    ], select: ['requester_id', 'addressee_id'] }) : [];
    const found = new Set(rows.map((row) => row.requester_id === viewerId ? row.addressee_id : row.requester_id));
    return new Map(targetIds.map((id) => [id, id === viewerId || found.has(id)]));
  }

  async canSeeFromManyViewers(targetId: number, viewerIds: number[], key: 'presence_visibility' | 'activity_visibility') {
    const [settings, blocks] = await Promise.all([
      this.settingsFor(targetId),
      viewerIds.length ? this.blocks.find({ where: [
        { blocker_id: In(viewerIds), blocked_id: targetId },
        { blocker_id: targetId, blocked_id: In(viewerIds) },
      ], select: ['blocker_id', 'blocked_id'] }) : [],
    ]);
    const blocked = new Set(blocks.map((row) => row.blocker_id === targetId ? row.blocked_id : row.blocker_id));
    return new Map(viewerIds.map((viewerId) => [
      viewerId,
      !blocked.has(viewerId) && (settings[key] === 'everyone' || (settings[key] === 'friends' && viewerId !== targetId)),
    ]));
  }

  async isBlockedEither(firstUserId: number, secondUserId: number): Promise<boolean> {
    return this.blocks.exists({ where: [
      { blocker_id: firstUserId, blocked_id: secondUserId },
      { blocker_id: secondUserId, blocked_id: firstUserId },
    ] });
  }

  async isBlockedMany(viewerId: number, targetIds: number[]): Promise<Map<number, boolean>> {
    const ids = [...new Set(targetIds)].filter((id) => id !== viewerId);
    const rows = ids.length ? await this.blocks.find({ where: [
      { blocker_id: viewerId, blocked_id: In(ids) },
      { blocker_id: In(ids), blocked_id: viewerId },
    ], select: ['blocker_id', 'blocked_id'] }) : [];
    const found = new Set(rows.map((row) => row.blocker_id === viewerId ? row.blocked_id : row.blocker_id));
    return new Map(targetIds.map((id) => [id, found.has(id)]));
  }

  async settingsFor(userId: number): Promise<SocialPrivacySetting> {
    let settings = await this.privacy.findOneBy({ user_id: userId });
    if (settings) return settings;
    await this.privacy.createQueryBuilder().insert().orIgnore().values({ user_id: userId }).execute();
    settings = await this.privacy.findOneBy({ user_id: userId });
    return settings!;
  }

  async settingsForMany(userIds: number[]): Promise<Map<number, SocialPrivacySetting>> {
    if (!userIds.length) return new Map();
    const existing = await this.privacy.findBy({ user_id: In(userIds) });
    const missing = userIds.filter((id) => !existing.some((item) => item.user_id === id));
    if (missing.length) {
      await this.privacy.createQueryBuilder().insert().orIgnore()
        .values(missing.map((user_id) => ({ user_id }))).execute();
      existing.push(...await this.privacy.findBy({ user_id: In(missing) }));
    }
    return new Map(existing.map((item) => [item.user_id, item]));
  }

  async isVisible(viewerId: number, targetId: number, visibility: SocialVisibility): Promise<boolean> {
    if (viewerId === targetId) return true;
    if (await this.isBlockedEither(viewerId, targetId)) return false;
    if (visibility === 'everyone') return true;
    if (visibility === 'nobody') return false;
    return this.areFriends(viewerId, targetId);
  }

  async canSee(viewerId: number, targetId: number, key: 'presence_visibility' | 'activity_visibility'): Promise<boolean> {
    const [settings, visible] = await Promise.all([
      this.settingsFor(targetId),
      this.isBlockedEither(viewerId, targetId),
    ]);
    if (viewerId === targetId) return true;
    if (visible) return false;
    return this.isVisible(viewerId, targetId, settings[key]);
  }

  async canSeeMany(viewerId: number, targetIds: number[], key: 'presence_visibility' | 'activity_visibility'): Promise<Map<number, boolean>> {
    const ids = [...new Set(targetIds)].filter((id) => id !== viewerId);
    if (!ids.length) return new Map(targetIds.map((id) => [id, true]));
    const [settings, friendships, blocks] = await Promise.all([
      this.settingsForMany(ids),
      this.friendships.find({ where: [
        { requester_id: viewerId, addressee_id: In(ids), status: 'accepted' },
        { requester_id: In(ids), addressee_id: viewerId, status: 'accepted' },
      ], select: ['requester_id', 'addressee_id'] }),
      this.blocks.find({ where: [
        { blocker_id: viewerId, blocked_id: In(ids) },
        { blocker_id: In(ids), blocked_id: viewerId },
      ], select: ['blocker_id', 'blocked_id'] }),
    ]);
    const friendIds = new Set(friendships.map((row) => row.requester_id === viewerId ? row.addressee_id : row.requester_id));
    const blockedIds = new Set(blocks.map((row) => row.blocker_id === viewerId ? row.blocked_id : row.blocker_id));
    return new Map(targetIds.map((id) => {
      if (id === viewerId) return [id, true];
      if (blockedIds.has(id)) return [id, false];
      const visibility = settings.get(id)?.[key] ?? 'friends';
      return [id, visibility === 'everyone' || (visibility === 'friends' && friendIds.has(id))];
    }));
  }

  async canPerform(viewerId: number, targetId: number, key: 'allow_join' | 'allow_join_request' | 'allow_invites' | 'allow_messages'): Promise<boolean> {
    const [settings, blocked] = await Promise.all([this.settingsFor(targetId), this.isBlockedEither(viewerId, targetId)]);
    return !blocked && this.isVisible(viewerId, targetId, settings[key]);
  }

  async canPerformMany(viewerId: number, targetIds: number[], key: 'allow_join' | 'allow_join_request' | 'allow_invites' | 'allow_messages'): Promise<Map<number, boolean>> {
    const ids = [...new Set(targetIds)].filter((id) => id !== viewerId);
    if (!ids.length) return new Map(targetIds.map((id) => [id, true]));
    const [settings, friendships, blocks] = await Promise.all([
      this.settingsForMany(ids),
      this.friendships.find({ where: [
        { requester_id: viewerId, addressee_id: In(ids), status: 'accepted' },
        { requester_id: In(ids), addressee_id: viewerId, status: 'accepted' },
      ], select: ['requester_id', 'addressee_id'] }),
      this.blocks.find({ where: [
        { blocker_id: viewerId, blocked_id: In(ids) },
        { blocker_id: In(ids), blocked_id: viewerId },
      ], select: ['blocker_id', 'blocked_id'] }),
    ]);
    const friendIds = new Set(friendships.map((row) => row.requester_id === viewerId ? row.addressee_id : row.requester_id));
    const blockedIds = new Set(blocks.map((row) => row.blocker_id === viewerId ? row.blocked_id : row.blocker_id));
    return new Map(targetIds.map((id) => {
      if (id === viewerId) return [id, true];
      if (blockedIds.has(id)) return [id, false];
      const visibility = settings.get(id)?.[key] ?? 'friends';
      return [id, visibility === 'everyone' || (visibility === 'friends' && friendIds.has(id))];
    }));
  }
}
