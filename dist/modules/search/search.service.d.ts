import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { RedisService } from '../../database/redis.service';
export declare class SearchService {
    private postRepository;
    private userRepository;
    private searchHistoryRepo;
    private popularSearchRepo;
    private redisService;
    constructor(postRepository: Repository<Post>, userRepository: Repository<User>, searchHistoryRepo: Repository<SearchHistory>, popularSearchRepo: Repository<PopularSearch>, redisService: RedisService);
    searchPosts(query: string, options: {
        page?: number;
        limit?: number;
        category?: string;
        sort?: string;
    }): Promise<{
        data: Post[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    searchUsers(query: string, limit?: number): Promise<User[]>;
    recordSearch(userId: number | undefined, query: string, resultsCount: number): Promise<void>;
    getPopularSearches(limit?: number): Promise<string[]>;
    getSearchHistory(userId: number, limit?: number): Promise<SearchHistory[]>;
    clearSearchHistory(userId: number): Promise<void>;
}
