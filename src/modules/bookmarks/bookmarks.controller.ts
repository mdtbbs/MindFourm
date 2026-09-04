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
    const currentPage = page ? Number(page) : 1;
    const perPage = limit ? Number(limit) : 20;
    const result = await this.bookmarksService.getByUserId(userId, currentPage, perPage);
    return {
      data: result.bookmarks,
      pagination: {
        page: currentPage,
        limit: perPage,
        total: result.total,
        // See notifications.controller: the web client's normalizer needs all four
        // fields, and a missing one makes it report no data at all.
        totalPages: Math.max(1, Math.ceil(result.total / Math.max(1, perPage))),
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
