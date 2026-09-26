import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { AuthService } from '../../auth/auth.service';
import { BansService } from '../../bans/bans.service';

type Permission = { allowed: boolean; reason: string | null };

@Injectable()
export class V1PermissionResolverService {
  constructor(
    private readonly settings: SettingsService,
    private readonly auth: AuthService,
    private readonly bans: BansService,
  ) {}

  async resolve(user: any, authContext?: any): Promise<{
    thread_create: Permission;
    reply_create: Permission;
    resource_upload: Permission;
    message_read: Permission;
  }> {
    const [forumWrite, resourceUpload, messagesEnabled, thirdPartyMessages, needsTerms, isBanned] = await Promise.all([
      this.settings.getBoolean('feature_public_api_forum_write_enabled', true),
      this.settings.getBoolean('feature_resources_v1_upload_enabled', true),
      this.settings.getBoolean('feature_messages_enabled', true),
      this.settings.getBoolean('feature_messages_third_party_access_enabled', false),
      this.auth.checkNeedsTermsAcceptance(user),
      this.bans.isActive('user', user.id),
    ]);
    const gated = (featureEnabled: boolean, featureReason: string, needsPhone: boolean): Permission => {
      if (isBanned) return { allowed: false, reason: 'USER_BANNED' };
      if (needsTerms) return { allowed: false, reason: 'TERMS_ACCEPTANCE_REQUIRED' };
      if (!featureEnabled) return { allowed: false, reason: featureReason };
      if (needsPhone && !user.phone_verified) return { allowed: false, reason: 'PHONE_VERIFICATION_REQUIRED' };
      return { allowed: true, reason: null };
    };
    const isThirdParty = authContext?.source === 'mindauth_oauth' && authContext.partyType !== 'first_party';
    return {
      thread_create: gated(forumWrite, 'FEATURE_DISABLED', true),
      reply_create: gated(forumWrite, 'FEATURE_DISABLED', true),
      resource_upload: gated(resourceUpload, 'RESOURCE_UPLOAD_DISABLED', true),
      message_read: isBanned
        ? { allowed: false, reason: 'USER_BANNED' }
        : !messagesEnabled
        ? { allowed: false, reason: 'MESSAGING_DISABLED' }
        : isThirdParty && !thirdPartyMessages
          ? { allowed: false, reason: 'THIRD_PARTY_ACCESS_DISABLED' }
          : { allowed: true, reason: null },
    };
  }
}
