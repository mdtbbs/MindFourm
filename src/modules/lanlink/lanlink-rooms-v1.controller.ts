import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { LanLinkPublicRooms, LanLinkRoomsService } from './lanlink-rooms.service';

@ApiV1()
@ApiTags('v1-lanlink')
@Controller('v1/lanlink')
export class LanLinkRoomsV1Controller {
  constructor(private readonly rooms: LanLinkRoomsService) {}

  @Get('rooms')
  @ApiOkResponse({ description: 'Anonymous public LanLink room list' })
  list(): Promise<LanLinkPublicRooms> {
    return this.rooms.getPublicRooms();
  }
}
