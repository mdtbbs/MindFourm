import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service';
import { TemplateService } from './template.service';

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email service for sending emails via SMTP
 * Reads configuration from settings (category: 'email')
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private settingsService: SettingsService,
    private templateService: TemplateService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Initialize transporter on module init
    try {
      await this.initTransporter();
    } catch (error) {
      this.logger.warn(`Email transporter not initialized: ${(error as Error).message}`);
      // Don't throw - email is optional feature
    }
  }

  /**
   * Initialize SMTP transporter from settings
   */
  private async initTransporter(): Promise<void> {
    try {
      const config = await this.settingsService.getByCategory('email');

      // Check if SMTP is configured
      if (!config.smtp_host || !config.smtp_user) {
        this.logger.warn('SMTP not configured. Email sending is disabled.');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: parseInt(config.smtp_port || '587', 10),
        secure: config.smtp_secure === 'true',
        auth: {
          user: config.smtp_user,
          pass: config.smtp_password,
        },
      });

      // Verify connection
      await this.transporter.verify();
      this.logger.log('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize email transporter: ${(error as Error).message}`);
      this.transporter = null;
    }
  }

  /**
   * Send an email
   * @param options - Email options (to, subject, html, text)
   */
  async sendMail(options: MailOptions): Promise<void> {
    if (!this.transporter) {
      await this.initTransporter();
    }

    if (!this.transporter) {
      this.logger.warn('Email not sent: SMTP not configured');
      return;
    }

    try {
      const from = await this.settingsService.get('smtp_from');

      await this.transporter.sendMail({
        from: from || 'noreply@mindforum.com',
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      this.logger.log(`Email sent to ${options.to}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Send an email using a template
   * @param to - Recipient email address(es)
   * @param subject - Email subject
   * @param template - Template string with Handlebars syntax
   * @param variables - Variables to substitute in template
   * @param text - Optional plain text version
   */
  async sendTemplateEmail(
    to: string | string[],
    subject: string,
    template: string,
    variables: Record<string, any>,
    text?: string,
  ): Promise<void> {
    const html = this.templateService.render(template, variables);

    await this.sendMail({
      to,
      subject,
      html,
      text,
    });
  }

  /**
   * Check if email is configured
   */
  async isConfigured(): Promise<boolean> {
    if (!this.transporter) {
      await this.initTransporter();
    }
    return this.transporter !== null;
  }
}