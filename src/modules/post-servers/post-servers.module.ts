import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { PostServersController } from './post-servers.controller';
import { PostServersService } from './post-servers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, User])],
  controllers: [PostServersController],
  providers: [PostServersService],
  exports: [PostServersService],
})
export class PostServersModule {}
