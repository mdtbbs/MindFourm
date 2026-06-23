import { Repository } from 'typeorm';
import { Reply } from '../../entities/reply.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EventBusService } from '../plugins/event-bus.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { PointsService } from '../points/points.service';
import { SettingsService } from '../settings/settings.service';
export declare class RepliesService {
    private replyRepository;
    private postRepository;
    private userRepository;
    private notificationsService;
    private eventBus;
    private pointsService;
    private settingsService;
    constructor(replyRepository: Repository<Reply>, postRepository: Repository<Post>, userRepository: Repository<User>, notificationsService: NotificationsService, eventBus: EventBusService, pointsService: PointsService, settingsService: SettingsService);
    createReplyForPost(postId: number, dto: CreateReplyDto, userId: number): Promise<Reply>;
    awardPointsForReply(replyId: number, userId: number): Promise<void>;
    getByPostId(postId: number, page?: number, limit?: number): Promise<{
        data: Reply[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    findById(id: number): Promise<Reply>;
    update(id: number, content: string, userId: number): Promise<Reply>;
    softDelete(id: number, userId: number): Promise<void>;
}
