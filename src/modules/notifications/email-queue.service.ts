import { Injectable, Logger } from '@nestjs/common';
import { EmailService, MailOptions } from './email.service';

export interface EmailJob {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email queue service for asynchronous email sending
 * Currently uses a simple in-memory queue
 * Can be upgraded to use Bull/BullMQ with Redis for production
 */
@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);
  private readonly queue: EmailJob[] = [];
  private processing = false;

  constructor(private emailService: EmailService) {}

  /**
   * Add an email job to the queue
   * @param job - Email job to add
   */
  async addEmailJob(job: EmailJob): Promise<void> {
    this.queue.push(job);
    this.logger.debug(`Email job added to queue. Queue size: ${this.queue.length}`);

    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process the email queue
   * Sends emails one by one with retry logic
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      try {
        await this.sendWithRetry(job, 3);
        this.logger.debug(`Email sent successfully to ${job.to}`);
      } catch (error) {
        this.logger.error(`Failed to send email after retries: ${(error as Error).message}`);
        // Email log status is already set to 'sent' when queued
        // In production with BullMQ, we'd update the status here on failure
      }
    }

    this.processing = false;
  }

  /**
   * Send email with retry logic
   * @param job - Email job
   * @param maxAttempts - Maximum retry attempts
   */
  private async sendWithRetry(job: EmailJob, maxAttempts: number): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.emailService.sendMail(job);
        return;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Email send attempt ${attempt}/${maxAttempts} failed: ${(error as Error).message}`);

        if (attempt < maxAttempts) {
          // Exponential backoff: 1s, 2s, 4s...
          const delay = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
}