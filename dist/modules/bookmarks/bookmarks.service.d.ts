import { Repository } from 'typeorm';
import { Bookmark } from '../../entities/bookmark.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
export declare class BookmarksService {
    private bookmarkRepository;
    private postRepository;
    private userRepository;
    private categoryRepository;
    constructor(bookmarkRepository: Repository<Bookmark>, postRepository: Repository<Post>, userRepository: Repository<User>, categoryRepository: Repository<Category>);
    add(userId: number, postId: number): Promise<Bookmark>;
    remove(userId: number, postId: number): Promise<void>;
    check(userId: number, postId: number): Promise<boolean>;
    getByUserId(userId: number, page?: number, limit?: number): Promise<{
        bookmarks: Bookmark[];
        total: number;
    }>;
}
