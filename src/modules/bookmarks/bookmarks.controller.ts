import { Controller, Get, Post, Delete, Param, UseGuards, Req, Query } from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getBookmarks(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.id;
    const result = await this.bookmarksService.getByUserId(
      userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return {
      data: result.bookmarks,
      pagination: {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        total: result.total,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('check/:postId')
  async checkBookmark(@Param('postId') postId: number, @Req() req: any) {
    const userId = req.user.id;
    const isBookmarked = await this.bookmarksService.check(userId, Number(postId));
    return { isBookmarked };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':postId')
  async addBookmark(@Param('postId') postId: number, @Req() req: any) {
    const userId = req.user.id;
    const bookmark = await this.bookmarksService.add(userId, Number(postId));
    return { message: 'Bookmark added', data: bookmark };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':postId')
  async removeBookmark(@Param('postId') postId: number, @Req() req: any) {
    const userId = req.user.id;
    await this.bookmarksService.remove(userId, Number(postId));
    return { message: 'Bookmark removed' };
  }
}
