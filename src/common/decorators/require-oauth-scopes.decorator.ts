import { SetMetadata } from '@nestjs/common';

export const REQUIRED_OAUTH_SCOPES = 'mdtbbs:required-oauth-scopes';
export const RequireOAuthScopes = (...scopes: string[]) => SetMetadata(REQUIRED_OAUTH_SCOPES, scopes);
