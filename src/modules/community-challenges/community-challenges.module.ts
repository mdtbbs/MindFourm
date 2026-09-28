import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SettingsModule } from '../settings/settings.module';
import { CommunityChallengeService } from './community-challenge.service';

@Global()
@Module({
  imports: [DatabaseModule, SettingsModule],
  providers: [CommunityChallengeService],
  exports: [CommunityChallengeService],
})
export class CommunityChallengesModule {}
