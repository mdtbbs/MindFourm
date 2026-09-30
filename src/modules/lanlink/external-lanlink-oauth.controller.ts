import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { ExternalScope } from '@common/decorators/external-scope.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { AuthService } from '../auth/auth.service';
import { ResolveLanLinkOAuthDto } from './dto/resolve-lanlink-oauth.dto';

const DEFAULT_LANLINK_OAUTH_CLIENT_ID = 'lanlink-mindustry-mod';
const REQUIRED_SCOPES = [
  'profile',
  'friends.read',
  'presence.read',
  'presence.write',
  'multiplayer.read',
  'multiplayer.write',
] as const;
const EXPIRY_SKEW_SECONDS = 15;

@Controller('external/v1/lanlink/oauth')
@SkipPhoneVerification()
@UseGuards(ExternalApiKeyGuard)
export class ExternalLanLinkOAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('resolve')
  @ExternalScope('lanlink:auth')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async resolve(@Body() body: ResolveLanLinkOAuthDto, @Req() request: any) {
    const apiKey = request?.externalApiKey;
    const apiKeyScopes = Array.isArray(apiKey?.scopes) ? apiKey.scopes.map(String) : [];
    const hasBroadScope = apiKeyScopes.some((scope) => scope === '*' || scope.endsWith(':*'));
    if (!Number.isSafeInteger(Number(apiKey?.id)) || Number(apiKey.id) <= 0
      || !apiKeyScopes.includes('lanlink:auth') || hasBroadScope) {
      throw new ForbiddenException({ code: 'LANLINK_AUTH_API_KEY_REQUIRED', message: 'A dedicated LanLink auth API key is required' });
    }

    const { user, context } = await this.authService.resolveMindAuthBearer(body.access_token);
    const expectedClientId = process.env.LANLINK_MINDAUTH_CLIENT_ID?.trim() || DEFAULT_LANLINK_OAUTH_CLIENT_ID;
    if (context.source !== 'mindauth_oauth'
      || context.clientId !== expectedClientId
      || context.clientType !== 'public'
      || !['first_party', 'third_party'].includes(String(context.partyType))) {
      throw new UnauthorizedException({ code: 'LANLINK_OAUTH_CLIENT_INVALID', message: 'LanLink OAuth client is not allowed' });
    }

    const grantedScopes = new Set(context.scopes);
    const missingScopes = REQUIRED_SCOPES.filter((scope) => !grantedScopes.has(scope));
    if (missingScopes.length) {
      throw new ForbiddenException({ code: 'LANLINK_OAUTH_SCOPE_INSUFFICIENT', message: 'LanLink OAuth authorization is missing required scopes' });
    }

    const expiresAt = Number(context.expiresAt);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException({ code: 'LANLINK_OAUTH_TOKEN_EXPIRED', message: 'LanLink OAuth token is expired' });
    }
    const expiresIn = expiresAt - Math.floor(Date.now() / 1000) - EXPIRY_SKEW_SECONDS;
    if (expiresIn <= 0) {
      throw new UnauthorizedException({ code: 'LANLINK_OAUTH_TOKEN_EXPIRED', message: 'LanLink OAuth token is expired' });
    }
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || !user.username) {
      throw new UnauthorizedException({ code: 'LANLINK_OAUTH_IDENTITY_INVALID', message: 'LanLink OAuth identity is incomplete' });
    }

    // Keep the response limited to Forum's local identity fields. The opaque
    // MindAuth bearer must never be returned, persisted, or logged here.
    return {
      expires_at: expiresAt,
      user: {
        id: user.id,
        mindauth_id: user.mindauth_id == null ? null : String(user.mindauth_id),
        username: user.username,
        display_name: user.username,
        avatar_url: user.avatar_url || '',
        role: user.role || 'user',
        roles: [user.role || 'user'],
        phone_verified: !!user.phone_verified,
      },
    };
  }
}
