import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SocialPrivacySetting } from '../../entities/social-privacy-setting.entity';
import { UserPresencePreference, UserPresenceStatus } from '../../entities/user-presence-preference.entity';
import { PatchSocialPrivacyDto } from './dto/social-privacy.dto';

@Injectable()
export class SocialPrivacyService {
  constructor(
    @InjectRepository(SocialPrivacySetting) private readonly privacy: Repository<SocialPrivacySetting>,
    @InjectRepository(UserPresencePreference) private readonly preferences: Repository<UserPresencePreference>,
  ) {}

  async get(userId: number) {
    const settings = await this.ensurePrivacy(userId);
    const preference = await this.ensurePreference(userId);
    return {
      presence_visibility: settings.presence_visibility,
      activity_visibility: settings.activity_visibility,
      allow_join: settings.allow_join,
      allow_join_request: settings.allow_join_request,
      allow_invites: settings.allow_invites,
      show_last_seen: settings.show_last_seen,
      status: preference.status,
    };
  }

  async patch(userId: number, dto: PatchSocialPrivacyDto) {
    const [settings] = await Promise.all([this.ensurePrivacy(userId), this.ensurePreference(userId)]);
    const { status, ...privacyPatch } = dto as PatchSocialPrivacyDto & { status?: UserPresenceStatus };
    Object.assign(settings, privacyPatch);
    await this.privacy.save(settings);
    return this.get(userId);
  }

  async setStatus(userId: number, status: UserPresenceStatus): Promise<void> {
    const current = await this.ensurePreference(userId);
    current.status = status;
    await this.preferences.save(current);
  }

  async statusForMany(userIds: number[]): Promise<Map<number, UserPresenceStatus>> {
    if (!userIds.length) return new Map();
    const rows = await this.preferences.findBy({ user_id: In(userIds) });
    const missing = userIds.filter((id) => !rows.some((row) => row.user_id === id));
    if (missing.length) {
      await this.preferences.createQueryBuilder().insert().orIgnore()
        .values(missing.map((user_id) => ({ user_id }))).execute();
      rows.push(...await this.preferences.findBy({ user_id: In(missing) }));
    }
    return new Map(rows.map((row) => [row.user_id, row.status]));
  }

  private async ensurePrivacy(userId: number): Promise<SocialPrivacySetting> {
    let row = await this.privacy.findOneBy({ user_id: userId });
    if (!row) {
      await this.privacy.createQueryBuilder().insert().orIgnore().values({ user_id: userId }).execute();
      row = await this.privacy.findOneBy({ user_id: userId });
    }
    return row!;
  }

  private async ensurePreference(userId: number): Promise<UserPresencePreference> {
    let row = await this.preferences.findOneBy({ user_id: userId });
    if (!row) {
      await this.preferences.createQueryBuilder().insert().orIgnore().values({ user_id: userId }).execute();
      row = await this.preferences.findOneBy({ user_id: userId });
    }
    return row!;
  }
}
