import { SetMetadata } from '@nestjs/common';

export const EXTERNAL_SCOPE_KEY = 'externalApiScopes';

export const ExternalScope = (...scopes: string[]) => SetMetadata(EXTERNAL_SCOPE_KEY, scopes);
