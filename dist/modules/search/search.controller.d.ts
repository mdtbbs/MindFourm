import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
export declare class SearchController {
    private readonly searchService;
    constructor(searchService: SearchService);
    search(dto: SearchQueryDto): Promise<{
        success: boolean;
        data: {
            data: import("../../entities").Post[];
            pagination: {
                page: number;
                limit: number;
                total: number;
                totalPages: number;
            };
        };
        popular_searches: string[];
    }>;
    getHistory(req: any): Promise<{
        success: boolean;
        data: import("../../entities").SearchHistory[];
    }>;
    clearHistory(req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    getPopular(): Promise<{
        success: boolean;
        data: string[];
    }>;
}
