import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Post, Reply])],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
