import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomEmoji } from '@entities/custom-emoji.entity';
import { CustomEmojisController } from './custom-emojis.controller';
import { CustomEmojisService } from './custom-emojis.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomEmoji])],
  controllers: [CustomEmojisController],
  providers: [CustomEmojisService],
  exports: [CustomEmojisService],
})
export class CustomEmojisModule {}
