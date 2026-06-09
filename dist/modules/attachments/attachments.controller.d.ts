import { AttachmentsService } from './attachments.service';
import type { Request, Response } from 'express';
export declare class AttachmentsController {
    private readonly attachmentsService;
    constructor(attachmentsService: AttachmentsService);
    upload(files: Express.Multer.File[], body: {
        post_id?: number;
        reply_id?: number;
    }, req: Request): Promise<{
        message: string;
        attachments: any[];
    }>;
    getByPost(postId: number): Promise<import("../../entities").Attachment[]>;
    download(id: number, res: Response): Promise<void>;
    delete(id: number, req: Request): Promise<{
        message: string;
    }>;
}
