import { AutoPostService } from './auto-post.service';
import { ServerApprovedCallbackDto } from './dto/server-approved-callback.dto';
export declare class AutoPostController {
    private autoPostService;
    constructor(autoPostService: AutoPostService);
    handleServerApproved(dto: ServerApprovedCallbackDto): Promise<{
        success: boolean;
        post_id: any;
        message: string;
        duplicate: boolean;
        created?: undefined;
    } | {
        success: boolean;
        post_id: number;
        created: boolean;
        message?: undefined;
        duplicate?: undefined;
    }>;
}
