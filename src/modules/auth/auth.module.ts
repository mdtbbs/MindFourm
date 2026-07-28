import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@entities/user.entity';
import { SessionAudit } from '@entities/session-audit.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TestAuthController } from './test-auth.controller';
import { isTestAuthEnabled } from './test-auth.util';
import { PointsModule } from '../points/points.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, SessionAudit]),
    PointsModule,
    NotificationsModule,
  ],
  providers: [AuthService],
  // The E2E session shortcut is only routable when explicitly enabled via
  // ENABLE_TEST_AUTH; see test-auth.util.ts for why this is opt-in.
  controllers: [AuthController, ...(isTestAuthEnabled() ? [TestAuthController] : [])],
  exports: [AuthService, TypeOrmModule],
})
export class AuthModule {}
