import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { ConfigService } from '@nestjs/config';
export declare class RssService {
    private postRepo;
    private categoryRepo;
    private configService;
    constructor(postRepo: Repository<Post>, categoryRepo: Repository<Category>, configService: ConfigService);
    private escapeXml;
    private toRFC822;
    generatePostsRss(): Promise<string>;
    generateCategoryRss(categorySlug: string): Promise<string>;
}
