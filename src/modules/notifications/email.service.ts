import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service';
import { TemplateService } from './template.service';

export class EmailTransportUnavailableError extends Error {
  constructor(message = 'SMTP not configured') {
    super(message);
    this.name = 'EmailTransportUnavailableError';
  }
}

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

type EmailSettings = Record<string, string>;

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private transporterInitError: Error | null = null;
  private transporterFingerprint: string | null = null;

  constructor(
    private settingsService: SettingsService,
    private templateService: TemplateService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTransporterCurrent();
    } catch (error) {
      this.logger.warn(`Email transporter not initialized: ${(error as Error).message}`);
    }
  }

  private configFingerprint(config: EmailSettings): string {
    return JSON.stringify([
      config.smtp_host || '',
      config.smtp_port || '587',
      config.smtp_secure || 'false',
      config.smtp_user || '',
      config.smtp_password || '',
    ]);
  }

  private async ensureTransporterCurrent(): Promise<EmailSettings> {
    const config = await this.settingsService.getByCategory('email');
    const fingerprint = this.configFingerprint(config);
    if (!this.transporter || fingerprint !== this.transporterFingerprint) {
      await this.initTransporter(config, fingerprint);
    }
    return config;
  }

  private async initTransporter(config: EmailSettings, fingerprint = this.configFingerprint(config)): Promise<void> {
    this.transporterFingerprint = fingerprint;

    if (!config.smtp_host?.trim()) {
      this.logger.warn('SMTP not configured. Email sending is disabled.');
      this.transporter = null;
      this.transporterInitError = new EmailTransportUnavailableError();
      return;
    }

    const port = Number.parseInt(config.smtp_port || '587', 10);
    const legacy587ImplicitTls = port === 587 && config.smtp_secure === 'true';
    const secure = config.smtp_secure === 'true' && port !== 587;
    if (legacy587ImplicitTls) {
      this.logger.warn('smtp_secure=true with port 587 is a legacy invalid combination; using STARTTLS semantics.');
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: config.smtp_host.trim(),
        port,
        secure,
        requireTLS: port === 587,
        auth: config.smtp_user?.trim()
          ? {
              user: config.smtp_user,
              pass: config.smtp_password,
            }
          : undefined,
      });

      await this.transporter.verify();
      this.transporterInitError = null;
      this.logger.log('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize email transporter: ${(error as Error).message}`);
      this.transporter = null;
      this.transporterInitError = error as Error;
    }
  }

  async sendMail(options: MailOptions): Promise<string | null> {
    const config = await this.ensureTransporterCurrent();

    if (!this.transporter) {
      if (this.transporterInitError instanceof EmailTransportUnavailableError) {
        this.logger.warn('Email not sent: SMTP not configured');
        throw this.transporterInitError;
      }
      this.logger.warn('Email not sent: SMTP transport unavailable');
      throw this.transporterInitError ?? new Error('SMTP transport unavailable');
    }

    try {
      const info = await this.transporter.sendMail({
        from: config.smtp_from || config.smtp_user || 'MDTBBS <noreply@mdtbbs.cn>',
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      this.logger.log(`Email sent to ${options.to}`);
      return typeof info?.messageId === 'string' ? info.messageId : null;
    } catch (error) {
      this.logger.error(`Failed to send email: ${(error as Error).message}`);
      throw error;
    }
  }

  async sendTemplateEmail(
    to: string | string[],
    subject: string,
    template: string,
    variables: Record<string, any>,
    text?: string,
  ): Promise<void> {
    const html = this.templateService.render(template, variables);
    await this.sendMail({ to, subject, html, text });
  }

  async isConfigured(): Promise<boolean> {
    await this.ensureTransporterCurrent();
    return this.transporter !== null;
  }
}
