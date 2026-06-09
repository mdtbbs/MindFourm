import { Repository } from 'typeorm';
import { Attachment } from '@entities/attachment.entity';
import { Post } from '@entities/post.entity';
export declare class AttachmentsService {
    private attachmentRepository;
    private postRepository;
    constructor(attachmentRepository: Repository<Attachment>, postRepository: Repository<Post>);
    create(data: {
        post_id?: number;
        reply_id?: number;
        user_id: number;
        file_name: string;
        file_path: string;
        file_size: number;
        mime_type: string;
    }): Promise<Attachment>;
    getByPostId(postId: number): Promise<Attachment[]>;
    getByReplyId(replyId: number): Promise<Attachment[]>;
    incrementDownloadCount(id: number): Promise<void>;
    getById(id: number): Promise<Attachment>;
    delete(id: number, userId: number, isAdmin: boolean): Promise<void>;
}
