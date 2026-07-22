import { Module, Global, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@entities/user.entity';
import { SessionAudit } from '@entities/session-audit.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PointsModule } from '../points/points.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, SessionAudit]),
    PointsModule,
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService, TypeOrmModule],
})
export class AuthModule {}
