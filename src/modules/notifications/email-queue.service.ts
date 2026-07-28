import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue, Worker, Job } from 'bullmq';
import { Repository } from 'typeorm';
import { EmailLog } from '../../entities/email-log.entity';
import { RedisService } from '../../database/redis.service';
import { EmailService, EmailTransportUnavailableError } from './email.service';

export interface EmailJob {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  logId?: number;
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
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
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
      async (job: Job<EmailJob>) => this.processEmailJob(job.data),
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

  private truncateErrorMessage(message: string): string {
    return message.length > 1000 ? `${message.slice(0, 997)}...` : message;
  }

  async processEmailJob(job: EmailJob): Promise<void> {
    const { to, subject, html, text, logId } = job;

    try {
      await this.emailService.sendMail({ to, subject, html, text });
      await this.updateEmailLog(logId, {
        status: 'sent',
        error_message: null,
      });
    } catch (error) {
      const err = error as Error;
      await this.updateEmailLog(logId, {
        status: 'failed',
        error_message: this.truncateErrorMessage(err.message),
      });

      if (error instanceof EmailTransportUnavailableError) {
        this.logger.warn(`Email transport unavailable: ${subject} -> ${to}`);
        return;
      }

      throw error;
    }
  }

  private async updateEmailLog(
    logId: number | undefined,
    patch: Pick<EmailLog, 'status' | 'error_message'>,
  ): Promise<void> {
    if (!logId) {
      return;
    }

    try {
      await this.emailLogRepository.update(logId, patch);
    } catch (error) {
      this.logger.warn(
        `Failed to update email log ${logId}: ${(error as Error).message}`,
      );
    }
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
