import { SetMetadata } from '@nestjs/common';

export const SKIP_PHONE_VERIFICATION_KEY = 'skipPhoneVerification';
export const SkipPhoneVerification = () => SetMetadata(SKIP_PHONE_VERIFICATION_KEY, true);
