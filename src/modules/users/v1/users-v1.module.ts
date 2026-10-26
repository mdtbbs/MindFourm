import { Module } from '@nestjs/common';
import { UsersModule } from '../users.module';
import { UsersV1Controller } from './users-v1.controller';
import { FriendsModule } from '../../friends/friends.module';

@Module({
  imports: [UsersModule, FriendsModule],
  controllers: [UsersV1Controller],
})
export class UsersV1Module {}
