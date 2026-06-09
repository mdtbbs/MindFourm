import { OnModuleInit } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { TemplateService } from './template.service';
export interface MailOptions {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
}
export declare class EmailService implements OnModuleInit {
    private settingsService;
    private templateService;
    private readonly logger;
    private transporter;
    constructor(settingsService: SettingsService, templateService: TemplateService);
    onModuleInit(): Promise<void>;
    private initTransporter;
    sendMail(options: MailOptions): Promise<void>;
    sendTemplateEmail(to: string | string[], subject: string, template: string, variables: Record<string, any>, text?: string): Promise<void>;
    isConfigured(): Promise<boolean>;
}
