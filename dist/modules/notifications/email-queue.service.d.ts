import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EmailService } from './email.service';
import { RedisService } from '../../database/redis.service';
export interface EmailJob {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
}
export declare class EmailQueueService implements OnModuleInit, OnModuleDestroy {
    private emailService;
    private redisService;
    private readonly logger;
    private queue;
    private worker;
    constructor(emailService: EmailService, redisService: RedisService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    addEmailJob(job: EmailJob): Promise<void>;
    getQueueSize(): Promise<number>;
}
