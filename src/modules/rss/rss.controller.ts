import { Controller, Get, Param, Res, Header } from '@nestjs/common';
import { Response } from 'express';
import { RssService } from './rss.service';

@Controller('rss')
export class RssController {
  constructor(private readonly rssService: RssService) {}

  @Get('posts.xml')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  async getPostsRss(@Res() res: Response) {
    const xml = await this.rssService.generatePostsRss();
    res.send(xml);
  }

  @Get('categories/:slug.xml')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  async getCategoryRss(@Param('slug') slug: string, @Res() res: Response) {
    const xml = await this.rssService.generateCategoryRss(slug);
    res.send(xml);
  }
}
