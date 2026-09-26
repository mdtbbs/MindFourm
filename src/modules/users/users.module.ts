import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { SearchModule } from '../search/search.module';
import { V1PermissionResolverService } from './v1/v1-permission-resolver.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Post, Reply]), SettingsModule, LogsModule, AdminNotificationsModule, SearchModule],
  providers: [UsersService, V1PermissionResolverService],
  exports: [UsersService, V1PermissionResolverService],
  controllers: [UsersController],
})
export class UsersModule {}
