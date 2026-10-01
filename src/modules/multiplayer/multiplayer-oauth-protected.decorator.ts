import { applyDecorators, UseGuards } from '@nestjs/common';
import { OAuthProtected } from '../../common/decorators/oauth-protected.decorator';
import { ThirdPartyMultiplayerGuard } from './third-party-multiplayer.guard';

/** Adds the site-level third-party Multiplayer rollout flag after OAuth scope auth. */
export function MultiplayerOAuthProtected(...scopes: string[]) {
  return applyDecorators(
    OAuthProtected(...scopes),
    UseGuards(ThirdPartyMultiplayerGuard),
  );
}
