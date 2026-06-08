import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { EmailService, MailOptions } from './email.service';
import { RedisService } from '../../database/redis.service';

export interface EmailJob {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email queue service for asynchronous email sending using BullMQ
 * Provides persistent queue with retry logic and concurrency control
 */
@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private queue: Queue;
  private worker: Worker;

  constructor(
    private emailService: EmailService,
    private redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisConfig = this.redisService.getConnectionConfig();

    this.queue = new Queue('email-queue', {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    this.worker = new Worker(
      'email-queue',
      async (job: Job<{ to: string | string[]; subject: string; html: string; text?: string }>) => {
        const { to, subject, html, text } = job.data;
        await this.emailService.sendMail({ to, subject, html, text });
      },
      {
        connection: redisConfig,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Email sent: ${job.data.subject} -> ${job.data.to}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Email failed: ${job?.data?.subject} -> ${job?.data?.to}: ${err.message}`,
      );
    });

    this.logger.log('Email queue initialized with BullMQ');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.worker.close();
  }

  /**
   * Add an email job to the queue
   */
  async addEmailJob(job: EmailJob): Promise<void> {
    await this.queue.add('send-email', job);
  }

  /**
   * Get current queue size (waiting + active jobs)
   */
  async getQueueSize(): Promise<number> {
    const jobs = await this.queue.getJobCounts('waiting', 'active');
    return jobs.waiting + jobs.active;
  }
}
