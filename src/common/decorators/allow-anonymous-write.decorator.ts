import { SetMetadata } from '@nestjs/common';

export const ALLOW_ANONYMOUS_WRITE_KEY = 'allowAnonymousWrite';

/** Allows an ephemeral, non-persistent write route to accept visitors. */
export const AllowAnonymousWrite = () => SetMetadata(ALLOW_ANONYMOUS_WRITE_KEY, true);
