import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBlock } from '@entities/user-block.entity';
import { User } from '@entities/user.entity';
import { UserBlocksService } from './user-blocks.service';
import { UserBlocksController } from './user-blocks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserBlock, User])],
  controllers: [UserBlocksController],
  providers: [UserBlocksService],
  exports: [UserBlocksService],
})
export class UserBlocksModule {}
