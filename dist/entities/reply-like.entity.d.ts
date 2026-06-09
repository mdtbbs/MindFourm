import { User } from './user.entity';
import { Reply } from './reply.entity';
export declare class ReplyLike {
    user_id: number;
    reply_id: number;
    created_at: Date;
    user: User;
    reply: Reply;
}
