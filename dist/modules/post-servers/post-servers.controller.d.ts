import { PostServersService } from './post-servers.service';
import { LinkPostServerDto } from './dto/link-post-server.dto';
export declare class PostServersController {
    private postServersService;
    constructor(postServersService: PostServersService);
    getByServer(serverId: string): Promise<import("../../entities").Post[]>;
    getMyServers(): Promise<{
        message: string;
    }>;
    getForumPosts(serverId: string): Promise<{
        id: number;
        title: string;
        post_type: string;
        status: string;
        created_at: Date;
        user: {
            username: string;
        };
        category: {
            name: string;
            slug: string;
        };
    }[]>;
    linkPost(dto: LinkPostServerDto, req: any): Promise<{
        success: boolean;
        post_id: number;
        server_id: number;
    }>;
    unlinkPost(postId: string, req: any): Promise<{
        success: boolean;
        post_id: number;
    }>;
}
