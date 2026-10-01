import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '../../entities/friendship.entity';
import { UserBlock } from '../../entities/user-block.entity';
import { SocialPrivacySetting } from '../../entities/social-privacy-setting.entity';
import { UserPresencePreference } from '../../entities/user-presence-preference.entity';
import { FriendsModule } from '../friends/friends.module';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';
import { SocialPolicyService } from './social-policy.service';
import { SocialPrivacyService } from './social-privacy.service';
import { FriendsV1Controller, UserBlocksV1Controller, BlocksV1Controller, SocialPrivacyV1Controller } from './social-v1.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Friendship, UserBlock, SocialPrivacySetting, UserPresencePreference]), FriendsModule, UserBlocksModule],
  controllers: [FriendsV1Controller, UserBlocksV1Controller, BlocksV1Controller, SocialPrivacyV1Controller],
  providers: [SocialPolicyService, SocialPrivacyService],
  exports: [SocialPolicyService, SocialPrivacyService],
})
export class SocialModule {}
