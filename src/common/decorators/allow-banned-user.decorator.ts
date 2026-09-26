import { SetMetadata } from '@nestjs/common';

/** Allow a narrowly scoped self-service read to report an account's ban state. */
export const ALLOW_BANNED_USER_KEY = 'allow-banned-user';
export const AllowBannedUser = () => SetMetadata(ALLOW_BANNED_USER_KEY, true);
