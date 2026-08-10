import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from '@entities/media-asset.entity';
import { ResourceMediaLink } from '@entities/resource-media-link.entity';
import { MediaService } from './media.service';

@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset, ResourceMediaLink])],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
