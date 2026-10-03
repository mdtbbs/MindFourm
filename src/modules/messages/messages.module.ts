import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';
import { MessagesController, GroupChatsController } from './messages.controller';
import { Message } from '@entities/message.entity';
import { User } from '@entities/user.entity';
import { GroupChat } from '@entities/group-chat.entity';
import { GroupChatMember } from '@entities/group-chat-member.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';
import { MessagesV1Controller } from './v1/messages-v1.controller';
import { OAuthScopeGuard } from '../../common/guards/oauth-scope.guard';
import { SettingsModule } from '../settings/settings.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, User, GroupChat, GroupChatMember]),
    NotificationsModule,
    UserBlocksModule,
    SettingsModule,
    SocialModule,
  ],
  controllers: [MessagesController, GroupChatsController, MessagesV1Controller],
  providers: [MessagesService, OAuthScopeGuard],
  exports: [MessagesService],
})
export class MessagesModule {}
