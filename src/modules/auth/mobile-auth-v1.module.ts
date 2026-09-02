import { Module } from '@nestjs/common';
import { MobileAuthController } from './mobile-auth.controller';

// AuthModule is global and supplies AuthService. Keeping this controller in its own
// module prevents legacy web OAuth endpoints from leaking into the V1 OpenAPI document.
@Module({ controllers: [MobileAuthController] })
export class MobileAuthV1Module {}
