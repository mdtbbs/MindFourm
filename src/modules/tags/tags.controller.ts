import { Controller, Get, Param, Query } from '@nestjs/common';
import { TagsService } from './tags.service';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  async getAll() {
    return this.tagsService.getAll();
  }

  @Get(':slug/posts')
  async getPostsByTagSlug(
    @Param('slug') slug: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.tagsService.getPostsByTagSlug(slug, page, limit);
  }
}
