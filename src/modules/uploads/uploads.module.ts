import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { UploadsV1Controller } from './v1-uploads.controller';

@Module({
  controllers: [UploadsController, UploadsV1Controller],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
