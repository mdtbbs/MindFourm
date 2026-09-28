import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { AuthService } from '../../auth/auth.service';
import { BansService } from '../../bans/bans.service';
import { SiteConfigService } from '../../../config/site-profile';

type Permission = { allowed: boolean; reason: string | null };

@Injectable()
export class V1PermissionResolverService {
  constructor(
    private readonly settings: SettingsService,
    private readonly auth: AuthService,
    private readonly bans: BansService,
    private readonly siteConfig: SiteConfigService,
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
    const policy = this.siteConfig.current.verification;
    const gated = (featureEnabled: boolean, featureReason: string): Permission => {
      if (isBanned) return { allowed: false, reason: 'USER_BANNED' };
      if (needsTerms) return { allowed: false, reason: 'TERMS_ACCEPTANCE_REQUIRED' };
      if (!featureEnabled) return { allowed: false, reason: featureReason };
      if (policy.requireEmail && !user.email_verified) return { allowed: false, reason: 'EMAIL_VERIFICATION_REQUIRED' };
      if (policy.requirePhoneForWrites && !user.phone_verified) return { allowed: false, reason: 'PHONE_VERIFICATION_REQUIRED' };
      return { allowed: true, reason: null };
    };
    const isThirdParty = authContext?.source === 'mindauth_oauth' && authContext.partyType !== 'first_party';
    return {
      thread_create: gated(forumWrite, 'FEATURE_DISABLED'),
      reply_create: gated(forumWrite, 'FEATURE_DISABLED'),
      resource_upload: gated(resourceUpload, 'RESOURCE_UPLOAD_DISABLED'),
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
