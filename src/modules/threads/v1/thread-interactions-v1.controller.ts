import { Controller, Delete, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '../../../common/decorators/api-v1.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BookmarksService } from '../../bookmarks/bookmarks.service';
import { LikesService } from '../../likes/likes.service';

@ApiV1()
@ApiTags('v1-thread-interactions')
@Controller('v1/threads')
@UseGuards(JwtAuthGuard)
export class ThreadInteractionsV1Controller {
  constructor(
    private readonly likesService: LikesService,
    private readonly bookmarksService: BookmarksService,
  ) {}

  @Put(':id/like')
  @ApiOkResponse({ description: 'Thread is liked; safe to repeat.' })
  like(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.likesService.ensurePostLiked(req.user.id, id);
  }

  @Delete(':id/like')
  @ApiOkResponse({ description: 'Thread is not liked; safe to repeat.' })
  unlike(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.likesService.ensurePostUnliked(req.user.id, id);
  }

  @Put(':id/bookmark')
  @ApiOkResponse({ description: 'Thread is bookmarked; safe to repeat.' })
  async bookmark(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.bookmarksService.add(req.user.id, id);
    return { bookmarked: true };
  }

  @Delete(':id/bookmark')
  @ApiOkResponse({ description: 'Thread is not bookmarked; safe to repeat.' })
  async removeBookmark(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.bookmarksService.ensureRemoved(req.user.id, id);
    return { bookmarked: false };
  }
}
