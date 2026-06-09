import { BookmarksService } from './bookmarks.service';
export declare class BookmarksController {
    private readonly bookmarksService;
    constructor(bookmarksService: BookmarksService);
    getBookmarks(req: any, page?: number, limit?: number): Promise<{
        data: import("../../entities").Bookmark[];
        pagination: {
            page: number;
            limit: number;
            total: number;
        };
    }>;
    checkBookmark(postId: number, req: any): Promise<{
        isBookmarked: boolean;
    }>;
    addBookmark(postId: number, req: any): Promise<{
        message: string;
        data: import("../../entities").Bookmark;
    }>;
    removeBookmark(postId: number, req: any): Promise<{
        message: string;
    }>;
}
