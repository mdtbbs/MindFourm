import { Controller, Get, Param, Post, Delete, Body, UseGuards, Req } from '@nestjs/common';
import { PostServersService } from './post-servers.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ServiceAuthGuard } from '@common/guards/service-auth.guard';
import { Public } from '@common/decorators/public.decorator';
import { LinkPostServerDto } from './dto/link-post-server.dto';

@Controller('post-servers')
export class PostServersController {
  constructor(private postServersService: PostServersService) {}

  @Get('by-server/:serverId')
  @Public()
  async getByServer(@Param('serverId') serverId: string) {
    return this.postServersService.getPostsByServer(Number(serverId));
  }

  // `GET /post-servers/my` removed: it answered 200 with prose telling the caller to
  // use /api/servers/my instead, which no client ever did.

  @Get('forum-posts/:serverId')
  @UseGuards(ServiceAuthGuard)
  async getForumPosts(@Param('serverId') serverId: string) {
    return this.postServersService.getForumPostsByServer(Number(serverId));
  }

  @Post('link')
  @UseGuards(JwtAuthGuard)
  async linkPost(@Body() dto: LinkPostServerDto, @Req() req: any) {
    return this.postServersService.linkPostToServer(dto.postId, dto.serverId, req.user.id);
  }

  @Delete(':postId/server')
  @UseGuards(JwtAuthGuard)
  async unlinkPost(@Param('postId') postId: string, @Req() req: any) {
    return this.postServersService.unlinkPostFromServer(Number(postId), req.user.id);
  }
}
