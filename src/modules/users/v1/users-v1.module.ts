import { Module } from '@nestjs/common';
import { UsersModule } from '../users.module';
import { UsersV1Controller } from './users-v1.controller';

@Module({
  imports: [UsersModule],
  controllers: [UsersV1Controller],
})
export class UsersV1Module {}
