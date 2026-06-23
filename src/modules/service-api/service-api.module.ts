import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@entities/user.entity';
import { PostsModule } from '../posts/posts.module';
import { RepliesModule } from '../replies/replies.module';
import { ServiceApiController } from './service-api.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PostsModule,
    RepliesModule,
  ],
  controllers: [ServiceApiController],
})
export class ServiceApiModule {}
