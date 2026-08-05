import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QQAuthController } from './qq-auth.controller';
import { QQAuthService } from './qq-auth.service';
import { User } from '@entities/user.entity';
import { UserDevice } from '@entities/user-device.entity';
import { LoginLog } from '@entities/login-log.entity';
import { SettingsModule } from '@modules/settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserDevice, LoginLog]),
    SettingsModule,
  ],
  controllers: [QQAuthController],
  providers: [QQAuthService],
  exports: [QQAuthService],
})
export class QQAuthModule {}
