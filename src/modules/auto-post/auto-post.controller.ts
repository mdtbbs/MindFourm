import { Controller, Post, Body, UseGuards, ConflictException } from '@nestjs/common';
import { AutoPostService } from './auto-post.service';
import { ServiceAuthGuard } from '@common/guards/service-auth.guard';
import { ServerApprovedCallbackDto } from './dto/server-approved-callback.dto';

@Controller('auto-post')
export class AutoPostController {
  constructor(private autoPostService: AutoPostService) {}

  @Post('server-approved')
  @UseGuards(ServiceAuthGuard)
  async handleServerApproved(@Body() dto: ServerApprovedCallbackDto) {
    const result = await this.autoPostService.createServerAnnouncement({
      server_name: dto.server_name,
      server_id: dto.server_id,
      description: dto.description,
      category_slug: dto.category_slug,
      event_id: dto.event_id,
    });

    if (!result.created) {
      return {
        success: true,
        post_id: (result.post as any).id,
        message: 'Server announcement already exists',
        duplicate: true,
      };
    }

    return {
      success: true,
      post_id: result.post.id,
      created: true,
    };
  }
}
