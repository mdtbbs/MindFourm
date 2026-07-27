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

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, User, GroupChat, GroupChatMember]),
    NotificationsModule,
    UserBlocksModule,
  ],
  controllers: [MessagesController, GroupChatsController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
