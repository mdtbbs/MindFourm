import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
export declare class UsersService {
    private userRepository;
    private postRepository;
    private replyRepository;
    constructor(userRepository: Repository<User>, postRepository: Repository<Post>, replyRepository: Repository<Reply>);
    getById(id: number): Promise<User & {
        post_count?: number;
        reply_count?: number;
    }>;
    getByMindAuthId(mindauthId: number): Promise<User | null>;
    updateProfile(id: number, dto: UpdateProfileDto): Promise<User>;
    updateAvatar(id: number, avatarUrl: string): Promise<User>;
    removeAvatar(id: number): Promise<User>;
    getRepliesByUserId(userId: number, page?: number, limit?: number): Promise<{
        replies: Reply[];
        total: number;
    }>;
    updateRole(id: number, role: string): Promise<User>;
    getAll(page?: number, limit?: number, search?: string): Promise<{
        users: User[];
        total: number;
    }>;
    searchByUsername(query: string, limit?: number): Promise<User[]>;
}
