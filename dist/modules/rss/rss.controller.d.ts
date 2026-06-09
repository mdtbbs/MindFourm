import { Response } from 'express';
import { RssService } from './rss.service';
export declare class RssController {
    private readonly rssService;
    constructor(rssService: RssService);
    getPostsRss(res: Response): Promise<void>;
    getCategoryRss(slug: string, res: Response): Promise<void>;
}
