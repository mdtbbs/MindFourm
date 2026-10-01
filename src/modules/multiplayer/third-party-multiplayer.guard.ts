import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { MultiplayerService } from './multiplayer.service';

@Injectable()
export class ThirdPartyMultiplayerGuard implements CanActivate {
  constructor(private readonly settings: SettingsService, private readonly multiplayer: MultiplayerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const auth = request.authContext;
    const isThirdParty = auth?.source === 'mindauth_oauth' && auth.partyType !== 'first_party';
    if (isThirdParty
      && !(await this.settings.getBoolean('feature_third_party_multiplayer_v1_enabled', false))) {
      throw new ForbiddenException({ code: 'FEATURE_DISABLED', message: 'FEATURE_DISABLED' });
    }
    if (isThirdParty) {
      await this.multiplayer.assertThirdPartyClientCapability(String(auth.clientId || ''), 'supports_multiplayer');
    }
    return true;
  }
}
